require('dotenv').config();
const path=require('node:path');
const fs=require('node:fs');
const http=require('node:http');
const express=require('express');
const helmet=require('helmet');
const rateLimit=require('express-rate-limit');
const users=require('./services/userService');
const data=require('./services/appDataService');
const bot=require('./controllers/botController');
const backend=require('./services/backendService');
const api=require('./routes/api');
const errors=require('./middlewares/errorHandler');
const app=express(),server=http.createServer(app);
const port=Number(process.env.PORT)||3000,dist=path.join(__dirname,'../mini-app/dist');
app.disable('x-powered-by');app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'",'https://telegram.org'],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],fontSrc:["'self'",'https://fonts.gstatic.com','data:'],imgSrc:["'self'",'data:','https:'],connectSrc:["'self'",'https://*.telegram.org'],frameAncestors:["'self'",'https://web.telegram.org','https://telegram.org']}},crossOriginEmbedderPolicy:false}));
app.use(express.json({limit:'32kb'}));
app.use('/api',rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));
app.get('/healthz',(_req,res)=>res.json({success:true,service:'hendy-bot-tele',bot:bot.isRunning(),timestamp:new Date().toISOString()}));
app.get('/api/health',(_req,res)=>res.json({success:true}));
app.use('/api/mini',api);
if(fs.existsSync(dist)){app.use(express.static(dist,{index:false,maxAge:'1h'}));app.get('*',(req,res,next)=>{if(req.path.startsWith('/api/')||req.path==='/healthz')return next();res.sendFile(path.join(dist,'index.html'));});}
else app.get('/',(_req,res)=>res.send('Hendy Bot Telegram đang hoạt động. Chạy npm run build để tạo Mini App.'));
app.use((_req,res)=>res.status(404).json({success:false,message:'Không tìm thấy tài nguyên.'}));
app.use(errors);
let closing=false;
function shutdown(signal){if(closing)return;closing=true;console.log('Đóng dịch vụ theo tín hiệu '+signal);bot.stopBot();backend.stopWebSocket();server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();}
async function start(){await users.loadDatabase();await data.init();server.listen(port,async()=>{console.log('Hendy Bot API đang chạy tại cổng '+port);await bot.startBot();backend.initWebSocket(bot);});}
process.once('SIGINT',()=>shutdown('SIGINT'));process.once('SIGTERM',()=>shutdown('SIGTERM'));
process.on('unhandledRejection',e=>console.error('Unhandled rejection:',e));
process.on('uncaughtException',e=>{console.error('Uncaught exception:',e);shutdown('uncaughtException');});
start().catch(e=>{console.error('Không thể khởi động ứng dụng:',e);process.exit(1);});
