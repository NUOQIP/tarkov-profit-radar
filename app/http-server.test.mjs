import test from 'node:test';
import assert from 'node:assert/strict';
import { clientAddress,createRadarServer } from './http-server.mjs';

const request=(peer,header)=>({socket:{remoteAddress:peer},headers:{'x-real-ip':header}});
test('forwarded client addresses require an explicitly trusted loopback proxy',()=>{
  assert.equal(clientAddress(request('127.0.0.1','198.51.100.1')),'127.0.0.1');
  assert.equal(clientAddress(request('203.0.113.1','198.51.100.1'),true),'203.0.113.1');
  assert.equal(clientAddress(request('::ffff:127.0.0.1','198.51.100.1'),true),'198.51.100.1');
  for(const header of ['198.51.100.1, 203.0.113.1','bad-address',undefined]){
    assert.equal(clientAddress(request('127.0.0.1',header),true),'127.0.0.1');
  }
});

test('separate visitors behind the configured proxy do not share the request limit',async t=>{
  const server=createRadarServer({},new Map(),{trustLoopbackProxy:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const url=`http://127.0.0.1:${server.address().port}/api/health`;
  async function get(ip){const r=await fetch(url,{headers:{'X-Real-IP':ip}});await r.arrayBuffer();return r.status;}
  for(let i=0;i<300;i++)assert.equal(await get('198.51.100.1'),200);
  assert.equal(await get('198.51.100.1'),429);
  assert.equal(await get('198.51.100.2'),200);
});
