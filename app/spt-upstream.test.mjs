import test from 'node:test';
import assert from 'node:assert/strict';
import {SPT_SOURCE} from './spt-rarity.mjs';
import {SPT_CHECK_KEY,SPT_CHECK_INTERVAL,SPT_MANUAL_INTERVAL,SPT_UPSTREAM_URL,checkSptUpstream,readSptStatus,sptCheckDue} from './spt-upstream.mjs';
const now=Date.parse('2026-10-22T08:00:00Z'),hour=3600000,newCommit='a'.repeat(40);
function memoryStore(){
  let entry=null,queue=Promise.resolve();
  return {
    read:async key=>{assert.equal(key,SPT_CHECK_KEY);return structuredClone(entry);},
    write:async(key,value)=>{assert.equal(key,SPT_CHECK_KEY);entry=structuredClone(value);},
    update(key,change){assert.equal(key,SPT_CHECK_KEY);const work=queue.then(()=>{const value=change(structuredClone(entry));if(value!==null)entry=structuredClone(value);});queue=work.catch(()=>{});return work;}
  };
}
const remote=(sha=SPT_SOURCE.commit,headers={})=>new Response(JSON.stringify([{sha,commit:{committer:{date:'2026-08-14T20:24:40Z'},message:'Update items\nDetailed message'}}]),{headers:{etag:'"items-v1"',...headers}});

test('weekly checks are durable, manual checks share a cooldown, and 304 extends freshness',async()=>{
  const store=memoryStore();let calls=0;
  const fetcher=async(url,options)=>{
    assert.equal(url,SPT_UPSTREAM_URL);calls++;
    if(calls===1)return remote();
    assert.equal(options.headers['If-None-Match'],'"items-v1"');return new Response(null,{status:304});
  };
  const first=await checkSptUpstream(store,{now,fetcher});
  assert.equal(first.status,'current');assert.equal(first.updateAvailable,false);assert.equal(first.current.commit,SPT_SOURCE.commit);
  assert.equal(Date.parse(first.nextCheckAt),now+SPT_CHECK_INTERVAL);
  await checkSptUpstream(store,{now:now+hour,fetcher});
  await checkSptUpstream(store,{now:now+100,force:true,fetcher});assert.equal(calls,1);
  const manual=await checkSptUpstream(store,{now:now+SPT_MANUAL_INTERVAL,force:true,fetcher});assert.equal(calls,2);
  assert.equal(Date.parse(manual.checkedAt),now+SPT_MANUAL_INTERVAL);
  assert.equal(sptCheckDue(manual,now+SPT_MANUAL_INTERVAL+SPT_CHECK_INTERVAL-1),false);
  await checkSptUpstream({...store},{now:now+SPT_MANUAL_INTERVAL+SPT_CHECK_INTERVAL,fetcher});assert.equal(calls,3);
});

test('a changed upstream commit is reported without changing the applied dataset',async()=>{
  const result=await checkSptUpstream(memoryStore(),{now,fetcher:async()=>remote(newCommit)});
  assert.equal(result.status,'update');assert.equal(result.updateAvailable,true);
  assert.equal(result.latest.commit,newCommit);assert.equal(result.current.commit,SPT_SOURCE.commit);
  assert.equal(result.latest.message,'Update items');
  assert.equal(result.latest.url,'https://github.com/emilanderss0n/tarkynator/commit/'+newCommit);
});

test('concurrent requests and separate store wrappers cannot fan out upstream traffic',async()=>{
  const store=memoryStore();let calls=0,release,started;
  const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
  const fetcher=async()=>{calls++;started();await gate;return remote();};
  const first=checkSptUpstream(store,{now,fetcher});const same=checkSptUpstream(store,{now,force:true,fetcher});
  await entered;
  const other=await checkSptUpstream({...store},{now,force:true,fetcher});
  assert.equal(other.status,'checking');assert.equal(sptCheckDue(other,now),false);assert.equal(calls,1);
  release();assert.equal((await first).status,'current');assert.equal((await same).status,'current');
});

test('network errors retain the last successful result and retry after an hour',async()=>{
  const store=memoryStore();const prior=await checkSptUpstream(store,{now,fetcher:async()=>remote(newCommit)});
  const later=now+SPT_CHECK_INTERVAL;
  const result=await checkSptUpstream(store,{now:later,fetcher:async()=>{throw new Error('network timeout');}});
  assert.equal(result.status,'error');assert.equal(result.updateAvailable,true);assert.equal(result.latest.commit,newCommit);
  assert.equal(result.checkedAt,prior.checkedAt);assert.equal(result.current.commit,SPT_SOURCE.commit);
  assert.equal(Date.parse(result.nextCheckAt),later+hour);assert.equal(result.checking,false);
});

test('malformed metadata, empty histories and ungrounded 304 responses never report success',async()=>{
  for(const fetcher of [async()=>new Response('[]'),async()=>new Response('{}'),async()=>new Response('not JSON'),async()=>new Response(null,{status:304}),async()=>remote('invalid')]){
    const result=await checkSptUpstream(memoryStore(),{now,fetcher});
    assert.equal(result.status,'error');assert.equal(result.checkedAt,null);assert.equal(result.latest,null);assert.equal(result.updateAvailable,null);
  }
});

test('upstream rate limits defer manual checks and tolerate malformed reset headers',async()=>{
  for(const headers of [{'retry-after':'7200'},{'x-ratelimit-reset':String(now/1000+7200)},{'x-ratelimit-reset':'invalid'}]){
    const store=memoryStore();let calls=0;
    const fetcher=async()=>{calls++;return new Response('',{status:429,headers});};
    const result=await checkSptUpstream(store,{now,fetcher});
    assert.equal(result.status,'error');assert.ok(Date.parse(result.nextManualAt)>=now+hour);
    await checkSptUpstream(store,{now:now+SPT_MANUAL_INTERVAL,force:true,fetcher});assert.equal(calls,1);
  }
});

test('an abandoned lease expires and cached status reads never contact the upstream',async()=>{
  const store=memoryStore();await store.write(SPT_CHECK_KEY,{checkingUntil:now+30000,nextManualAt:new Date(now+SPT_MANUAL_INTERVAL).toISOString()});
  assert.equal((await readSptStatus(store,now)).status,'checking');
  const result=await checkSptUpstream(store,{now:now+31000,fetcher:async()=>remote()});assert.equal(result.status,'current');
});
