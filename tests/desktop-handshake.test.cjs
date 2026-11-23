const assert=require('node:assert/strict');
const {EventEmitter,once}=require('node:events');
const http=require('node:http');
const {test}=require('node:test');
const startPanel=require('../desktop/panel.cjs');

test('desktop announces the same panel after a dropped connection and transient response',async t=>{
 const requests=[];
 const host=http.createServer(async (req,res)=>{
  let port='';for await(const chunk of req)port+=chunk;
  requests.push({port,url:req.url,authorization:req.headers.authorization});
  if(requests.length===1)req.socket.destroy();
  else{res.writeHead(requests.length===2?503:200);res.end();}
 });
 const win=new EventEmitter();
 t.after(()=>{win.emit('closed');host.closeAllConnections();host.close();});
 host.listen(0,'127.0.0.1');
 await once(host,'listening');
 process.env.PET_BRIDGE='http://127.0.0.1:'+host.address().port+'/decide';
 process.env.PET_SECRET='test-bridge';
 await startPanel(win,null,{});
 assert.equal(requests.length,3);
 for(const request of requests){
  assert.equal(request.port,requests[0].port);
  assert.match(request.port,/^\d{4,5}$/);
  assert.equal(request.url,'/desktop-online');
  assert.equal(request.authorization,'Bearer test-bridge');
 }
});

test('desktop closes its endpoint when a handshake is rejected',async t=>{
 let announcedPort,attempts=0;
 const host=http.createServer(async (req,res)=>{
  attempts++;
  let body='';for await(const chunk of req)body+=chunk;
  announcedPort=Number(body);
  res.writeHead(403);res.end();
 });
 t.after(()=>{host.closeAllConnections();host.close();});
 host.listen(0,'127.0.0.1');
 await once(host,'listening');
 process.env.PET_BRIDGE='http://127.0.0.1:'+host.address().port+'/decide';
 process.env.PET_SECRET='rejected';
 await assert.rejects(startPanel(new EventEmitter(),null,{}),/HTTP 403/);
 assert.equal(attempts,1);
 await assert.rejects(fetch('http://127.0.0.1:'+announcedPort),/fetch failed/);
});
