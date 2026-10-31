const fs = require('node:fs/promises');
const path = require('node:path');
const dir = process.env.DATA_DIR || path.join(process.cwd(),'data');
const file = path.join(dir,'users.json');
let users = {};
let queue = Promise.resolve();
function persist() {
  const snapshot = JSON.stringify(users,null,2);
  queue = queue.then(async()=>{await fs.mkdir(dir,{recursive:true});const tmp=file+'.tmp';await fs.writeFile(tmp,snapshot,{encoding:'utf8',mode:0o600});await fs.rename(tmp,file);});
  return queue;
}
async function loadDatabase() {
  await fs.mkdir(dir,{recursive:true});
  try { const value=JSON.parse(await fs.readFile(file,'utf8'));users=value&&typeof value==='object'&&!Array.isArray(value)?value:{}; }
  catch(error) {
    if(error.code!=='ENOENT'){await fs.rename(file,file+'.corrupt-'+Date.now()).catch(()=>{});console.error('Dữ liệu người dùng lỗi; đã cách ly tệp lỗi.');}
    users={};await persist();
  }
}
function initUser(chatId,telegramUser={}) {
  const id=String(chatId),name=[telegramUser.first_name,telegramUser.last_name].filter(Boolean).join(' ')||'Người dùng';
  if(!users[id]){users[id]={id,name,username:telegramUser.username||null,balance:0,vipLevel:0,createdAt:new Date().toISOString()};persist().catch(e=>console.error('Lưu người dùng:',e.message));}
  else{users[id].name=name;users[id].username=telegramUser.username||users[id].username||null;}
  return users[id];
}
module.exports={loadDatabase,saveDatabase:persist,initUser,getUser:id=>users[String(id)]||null,getUsers:()=>users};
