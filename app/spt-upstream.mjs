import { SPT_SOURCE } from './spt-rarity.mjs';

const MINUTE=60000,HOUR=60*MINUTE;
export const SPT_CHECK_INTERVAL=7*24*HOUR;
export const SPT_MANUAL_INTERVAL=10*MINUTE;
export const SPT_CHECK_KEY='spt/upstream.json';
export const SPT_UPSTREAM_URL='https://api.github.com/repos/emilanderss0n/tarkynator/commits?path=data/items.json&per_page=1';
const pending=new WeakMap(),shaPattern=/^[0-9a-f]{40}$/;
const commitUrl=sha=>`https://github.com/emilanderss0n/tarkynator/commit/${sha}`;
const validLatest=latest=>shaPattern.test(latest?.commit||'')&&Number.isFinite(Date.parse(latest.date));
const timestamp=value=>Number.isFinite(Date.parse(value))?Date.parse(value):0;

export function sptStatus(entry,now=Date.now()) {
  const latest=validLatest(entry?.latest)?entry.latest:null;
  const checking=Boolean(entry?.checkingUntil>now);
  const updateAvailable=latest?latest.commit!==SPT_SOURCE.commit:null;
  return {
    current:{commit:SPT_SOURCE.commit,version:SPT_SOURCE.version,url:commitUrl(SPT_SOURCE.commit)},
    latest:latest?{...latest,url:commitUrl(latest.commit)}:null,
    status:checking?'checking':entry?.error?'error':latest?(updateAvailable?'update':'current'):'unchecked',
    updateAvailable,checking,checkedAt:entry?.checkedAt||null,attemptedAt:entry?.attemptedAt||null,
    nextCheckAt:entry?.nextCheckAt||null,nextManualAt:entry?.nextManualAt||null,
    stale:Boolean(latest&&timestamp(entry.nextCheckAt)<=now),error:entry?.error||null,
    intervalDays:7
  };
}
export async function readSptStatus(store,now=Date.now()) {
  return sptStatus(await store.read(SPT_CHECK_KEY),now);
}
export function sptCheckDue(status,now=Date.now()) {
  return !status.checking&&timestamp(status.nextCheckAt)<=now;
}
async function update(store,change) {
  if(store.update)return store.update(SPT_CHECK_KEY,change);
  const value=change(await store.read(SPT_CHECK_KEY));
  if(value!==null)await store.write(SPT_CHECK_KEY,value);
}

// Compare only the item database's commits; ordinary website changes are irrelevant.
// The short persistent lease also coalesces separate hosted requests/instances.
export function checkSptUpstream(store,{force=false,now=Date.now(),fetcher=fetch}={}) {
  if(pending.has(store))return pending.get(store);
  const work=check(store,{force,now,fetcher}).finally(()=>pending.delete(store));
  pending.set(store,work);return work;
}
async function check(store,{force,now,fetcher}) {
  const checkId=crypto.randomUUID(),at=new Date(now).toISOString();
  let acquired=false,previous;
  await update(store,old=>{
    acquired=false;
    if(old?.checkingUntil>now||timestamp(force?old?.nextManualAt:old?.nextCheckAt)>now)return null;
    acquired=true;previous=old||{};
    return {...previous,version:1,checkId,checkingUntil:now+30000,attemptedAt:at,nextManualAt:new Date(now+SPT_MANUAL_INTERVAL).toISOString()};
  });
  if(!acquired)return readSptStatus(store,now);
  let result,retryDelay=HOUR,manualDelay=SPT_MANUAL_INTERVAL;
  try{
    const headers={Accept:'application/vnd.github+json','User-Agent':'tarkov-profit-radar'};
    if(previous.etag&&validLatest(previous.latest))headers['If-None-Match']=previous.etag;
    const response=await fetcher(SPT_UPSTREAM_URL,{headers,signal:AbortSignal.timeout(12000)});
    let latest,etag=response.headers.get('etag');
    if(response.status===304&&validLatest(previous.latest)){
      latest=previous.latest;etag=etag||previous.etag;
    }else{
      if(!response.ok){
        if(response.status===403||response.status===429){
          const retry=response.headers.get('retry-after'),reset=Number(response.headers.get('x-ratelimit-reset'))*1000;
          const delay=/^\d+$/.test(retry||'')?Number(retry)*1000:timestamp(retry)-now;
          retryDelay=Math.min(24*HOUR,Math.max(HOUR,Number.isFinite(delay)?delay:0,Number.isFinite(reset)?reset-now:0));manualDelay=retryDelay;
          throw new Error('上游暂时限流，稍后重试');
        }
        throw new Error('暂时连接不到上游');
      }
      const body=await response.json(),commit=Array.isArray(body)?body[0]:null;
      if(!shaPattern.test(commit?.sha||'')||!Number.isFinite(Date.parse(commit?.commit?.committer?.date)))throw new Error('上游版本信息不完整');
      latest={commit:commit.sha,date:commit.commit.committer.date,message:String(commit.commit.message||'').split('\n')[0].replace(/[\u0000-\u001f]/g,'').slice(0,160)};
    }
    result={latest,etag,checkedAt:at,error:null,nextCheckAt:new Date(now+SPT_CHECK_INTERVAL).toISOString()};
  }catch(error){
    const known=['上游暂时限流，稍后重试','暂时连接不到上游','上游版本信息不完整'];
    result={error:known.includes(error.message)?error.message:'检查未完成，稍后重试',nextCheckAt:new Date(now+retryDelay).toISOString()};
  }
  await update(store,old=>old?.checkId===checkId?{...old,...result,checkingUntil:0,nextManualAt:new Date(now+manualDelay).toISOString()}:null);
  return readSptStatus(store,now);
}
