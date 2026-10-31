const express=require('express');
const rateLimit=require('express-rate-limit');
const users=require('../services/userService');
const data=require('../services/appDataService');
const {requireTelegramAuth}=require('../security/telegramAuth');
const {encryptSecret}=require('../security/cryptoService');
const router=express.Router();
router.use(rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-7',legacyHeaders:false}),requireTelegramAuth);
router.get('/overview',(req,res)=>{const id=String(req.telegramUser.id);const user=users.initUser(id,req.telegramUser);res.json({success:true,data:data.getOverview(id,user)});});
router.post('/links',async(req,res,next)=>{
  try{
    const {brand,username,password,miniCode}=req.body||{};
    const allowed=new Set(['QQ88','78WIN','SC88','C168','CM88','F8BET']),b=String(brand||'').toUpperCase(),uid=String(req.telegramUser.id);
    if(!allowed.has(b))return res.status(400).json({success:false,message:'Nhà cung cấp không hợp lệ.'});
    if(typeof username!=='string'||username.trim().length<2||username.length>80)return res.status(400).json({success:false,message:'Tên tài khoản phải từ 2 đến 80 ký tự.'});
    if(typeof password!=='string'||password.length<1||password.length>256)return res.status(400).json({success:false,message:'Mật khẩu không hợp lệ.'});
    const owned=data.listLinkedAccounts(uid);
    if(owned.length>=10)return res.status(409).json({success:false,message:'Mỗi tài khoản Telegram chỉ được liên kết tối đa 10 tài khoản.'});
    if(owned.some(x=>x.brand===b&&x.username.toLowerCase()===username.trim().toLowerCase()))return res.status(409).json({success:false,message:'Tài khoản này đã được liên kết.'});
    const item=await data.addLinkedAccount(uid,{brand:b,username:username.trim(),miniCode:typeof miniCode==='string'&&miniCode.trim()?miniCode.trim().slice(0,80):username.trim(),encryptedPassword:encryptSecret(password)});
    res.status(201).json({success:true,data:item});
  }catch(e){next(e);}
});
router.delete('/links/:id',async(req,res,next)=>{try{if(!await data.deleteLinkedAccount(req.telegramUser.id,req.params.id))return res.status(404).json({success:false,message:'Không tìm thấy tài khoản liên kết.'});res.json({success:true});}catch(e){next(e);}});
router.post('/deposits',async(req,res,next)=>{
  try{const amount=Number(req.body?.amount),min=Math.max(10000,Number(process.env.MIN_DEPOSIT_VND)||10000);
    if(!Number.isSafeInteger(amount)||amount<min||amount>100000000)return res.status(400).json({success:false,message:'Số tiền nạp phải từ '+min.toLocaleString('vi-VN')+' đến 100.000.000 VNĐ.'});
    res.status(201).json({success:true,data:await data.createDeposit(req.telegramUser.id,amount),message:'Yêu cầu đã tạo và đang chờ xác nhận.'});
  }catch(e){next(e);}
});
router.get('/deposits',(req,res)=>res.json({success:true,data:data.listDeposits(req.telegramUser.id)}));
router.post('/support',async(req,res,next)=>{try{const message=String(req.body?.message||'').trim();if(message.length<5||message.length>2000)return res.status(400).json({success:false,message:'Nội dung hỗ trợ phải từ 5 đến 2.000 ký tự.'});res.status(201).json({success:true,data:await data.createTicket(req.telegramUser.id,message)});}catch(e){next(e);}});
router.get('/catalog',(_req,res)=>res.json({success:true,data:[]}));
module.exports=router;
