const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {verifyTelegramInitData}=require('./telegramAuth');
function make(token,user,date=Math.floor(Date.now()/1000)){
 const p=new URLSearchParams({auth_date:String(date),query_id:'AAExample',user:JSON.stringify(user)});
 const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const secret=crypto.createHmac('sha256','WebAppData').update(token).digest();
 p.set('hash',crypto.createHmac('sha256',secret).update(check).digest('hex'));return p.toString();
}
test('accepts valid Telegram initData',()=>{const t='123456:TEST_TOKEN',u={id:12345,first_name:'Hendy'};assert.deepEqual(verifyTelegramInitData(make(t,u),t),u);});
test('rejects altered Telegram initData',()=>{const t='123456:TEST_TOKEN';assert.throws(()=>verifyTelegramInitData(make(t,{id:12345,first_name:'Hendy'}).replace('Hendy','Other'),t),/chữ ký/i);});
test('rejects expired Telegram initData',()=>{const t='123456:TEST_TOKEN';assert.throws(()=>verifyTelegramInitData(make(t,{id:12345},Math.floor(Date.now()/1000)-90000),t),/hết hạn/i);});
