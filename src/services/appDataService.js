const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const dir=process.env.DATA_DIR||path.join(process.cwd(),'data');
const file=path.join(dir,'app-data.json');
let state={linkedAccounts:[],deposits:[],tickets:[]};
let queue=Promise.resolve();
function persist(){
  const snapshot=JSON.stringify(state,null,2);
  queue=queue.then(async()=>{await fs.mkdir(dir,{recursive:true});const tmp=file+'.tmp';await fs.writeFile(tmp,snapshot,{encoding:'utf8',mode:0o600});await fs.rename(tmp,file);});
  return queue;
}
async function init(){
  await fs.mkdir(dir,{recursive:true});
  try{const d=JSON.parse(await fs.readFile(file,'utf8'));state={linkedAccounts:Array.isArray(d.linkedAccounts)?d.linkedAccounts:[],deposits:Array.isArray(d.deposits)?d.deposits:[],tickets:Array.isArray(d.tickets)?d.tickets:[]};}
  catch(e){if(e.code!=='ENOENT'){await fs.rename(file,file+'.corrupt-'+Date.now()).catch(()=>{});console.error('Dữ liệu Mini App lỗi JSON; đã cách ly.');}await persist();}
}
const publicAccount=x=>({id:x.id,brand:x.brand,username:x.username,miniCode:x.miniCode,createdAt:x.createdAt});
function listLinkedAccounts(uid){return state.linkedAccounts.filter(x=>x.userId===String(uid)).map(publicAccount);}
async function addLinkedAccount(uid,input){
  const x={id:crypto.randomUUID(),userId:String(uid),brand:input.brand,username:input.username,miniCode:input.miniCode||input.username,encryptedPassword:input.encryptedPassword,createdAt:new Date().toISOString()};
  state.linkedAccounts.push(x);await persist();return publicAccount(x);
}
async function deleteLinkedAccount(uid,id){
  const n=state.linkedAccounts.length;state.linkedAccounts=state.linkedAccounts.filter(x=>!(x.userId===String(uid)&&x.id===id));
  if(n===state.linkedAccounts.length)return false;await persist();return true;
}
async function createDeposit(uid,amount){
  const reference='HND'+Date.now().toString(36).toUpperCase()+crypto.randomBytes(2).toString('hex').toUpperCase();
  const x={id:crypto.randomUUID(),reference,userId:String(uid),amount,status:'pending',createdAt:new Date().toISOString()};
  state.deposits.push(x);await persist();
  const bin=process.env.BANK_BIN,account=process.env.BANK_ACCOUNT;
  const qrUrl=bin&&account?'https://img.vietqr.io/image/'+encodeURIComponent(bin)+'-'+encodeURIComponent(account)+'-compact2.png?amount='+amount+'&addInfo='+encodeURIComponent(reference):null;
  return {...x,qrUrl,bankName:process.env.BANK_NAME||null,accountName:process.env.BANK_ACCOUNT_NAME||null};
}
function listDeposits(uid){return state.deposits.filter(x=>x.userId===String(uid)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(({id,reference,amount,status,createdAt})=>({id,reference,amount,status,createdAt}));}
function listPendingDeposits(limit=20){return state.deposits.filter(x=>x.status==='pending').slice(-limit).map(({id,reference,userId,amount,createdAt})=>({id,reference,userId,amount,createdAt}));}
async function createTicket(uid,message){
  const x={id:crypto.randomUUID(),userId:String(uid),message,status:'open',createdAt:new Date().toISOString()};state.tickets.push(x);await persist();return{id:x.id,status:x.status,createdAt:x.createdAt};
}
function getAdminOverview(users = {}) {
  const userEntries = Object.entries(users);
  const accountCounts = new Map();
  for (const account of state.linkedAccounts) {
    accountCounts.set(account.userId, (accountCounts.get(account.userId) || 0) + 1);
  }

  const recentUsers = userEntries
    .sort((a, b) => String(b[1].createdAt || '').localeCompare(String(a[1].createdAt || '')))
    .slice(0, 30)
    .map(([id, user]) => ({
      id,
      name: String(user.name || 'Người dùng').slice(0, 100),
      username: user.username || null,
      balance: Number(user.balance || 0),
      vipLevel: Number(user.vipLevel || 0),
      linkedAccounts: accountCounts.get(id) || 0,
      createdAt: user.createdAt || null
    }));

  const recentAccounts = state.linkedAccounts
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 20)
    .map(account => ({
      ...publicAccount(account),
      ownerId: account.userId
    }));

  return {
    totals: {
      users: userEntries.length,
      linkedAccounts: state.linkedAccounts.length
    },
    users: recentUsers,
    recentAccounts
  };
}

function getOverview(uid,user){
  const id=String(uid);
  return {profile:{id,name:user.name,username:user.username||null,balance:Number(user.balance||0),vipLevel:Number(user.vipLevel||0)},linkedAccounts:listLinkedAccounts(id),deposits:listDeposits(id).slice(0,5),counts:{linkedAccounts:state.linkedAccounts.filter(x=>x.userId===id).length,pendingDeposits:state.deposits.filter(x=>x.userId===id&&x.status==='pending').length,openTickets:state.tickets.filter(x=>x.userId===id&&x.status==='open').length}};
}
module.exports={init,persist,listLinkedAccounts,addLinkedAccount,deleteLinkedAccount,createDeposit,listDeposits,listPendingDeposits,createTicket,getOverview,getAdminOverview};
