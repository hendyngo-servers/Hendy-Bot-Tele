const WebSocket=require('ws');
let ws=null,timer=null,delay=2000,stopped=true,controller=null;
function sendLogToWeb(message){console.log('[BOT]',String(message).slice(0,500));if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({action:'RES_TELEGRAM_LOG',message:String(message).slice(0,500)}));}
function sendStatus(status){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({action:'RES_TELEGRAM_STATUS',status}));}
function retry(){ws=null;if(stopped||timer)return;timer=setTimeout(()=>{timer=null;connect();},delay);delay=Math.min(delay*2,60000);}
function connect(){
 if(stopped||!process.env.WS_URL||!process.env.WS_TOKEN)return;
 try{
  ws=new WebSocket(process.env.WS_URL,{headers:{Authorization:'Bearer '+process.env.WS_TOKEN},handshakeTimeout:10000});
  ws.on('open',()=>{delay=2000;sendStatus(controller?.isRunning()?'RUNNING':'STOPPED');});
  ws.on('message',async raw=>{try{const e=JSON.parse(raw.toString());if(e.action==='CMD_START_TELEGRAM'){const ok=await controller?.startBot();sendStatus(ok?'RUNNING':'STOPPED');}else if(e.action==='CMD_STOP_TELEGRAM'){controller?.stopBot();sendStatus('STOPPED');}else if(e.action==='CMD_TELEGRAM_BROADCAST'&&typeof e.message==='string')await controller?.broadcastToAdmin(e.message.slice(0,3500));}catch(err){console.warn('WebSocket command:',err.message);}});
  ws.on('close',retry);ws.on('error',e=>console.warn('WebSocket:',e.message));
 }catch(e){console.warn('WebSocket:',e.message);retry();}
}
function initWebSocket(bot){controller=bot;stopped=false;if(!process.env.WS_URL||!process.env.WS_TOKEN){console.log('WebSocket điều phối chưa cấu hình; bỏ qua.');return;}connect();}
function stopWebSocket(){stopped=true;if(timer)clearTimeout(timer);timer=null;if(ws){ws.removeAllListeners();ws.close();ws=null;}}
module.exports={initWebSocket,stopWebSocket,sendLogToWeb,sendStatus};
