import {createHash} from 'node:crypto';
const WEEK=7*86400000,MAX_BYTES=2*1024*1024;
const route=/^\/media\/v1\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,160}\.(?:webp|png|jpe?g))$/;
export function imageMimeType(body){
  if(body.length>=12&&body.toString('ascii',0,4)==='RIFF'&&body.toString('ascii',8,12)==='WEBP')return 'image/webp';
  if(body.length>=8&&body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(body.length>=3&&body[0]===255&&body[1]===216&&body[2]===255)return 'image/jpeg';
  return null;
}
export function createImageHandler(store,{fetchImage=fetch,now=Date.now,maxMemory=24*1024*1024}={}){
  const memory=new Map(),pending=new Map(),diskLoads=new Map(),failures=new Map(),waiting=[];let memorySize=0,active=0;
  async function acquire(){if(active<8){active++;return;}if(waiting.length>=256)throw new Error('Image queue full');await new Promise(resolve=>waiting.push(resolve));}
  function release(){const next=waiting.shift();if(next)next();else active--;}
  const remember=(name,entry)=>{
    if(memory.has(name))memorySize-=memory.get(name).body.length;
    const {data,...metadata}=entry,value={...metadata,body:Buffer.from(data,'base64')};
    memory.delete(name);memory.set(name,value);memorySize+=value.body.length;
    while(memorySize>maxMemory&&memory.size>1){const key=memory.keys().next().value;memorySize-=memory.get(key).body.length;memory.delete(key);}
    return value;
  };
  async function refresh(name){
    if(pending.has(name))return pending.get(name);
    if((failures.get(name)||0)>now())throw new Error('Image retry is cooling down');
    const task=(async()=>{
      await acquire();
      try{
      const response=await fetchImage('https://assets.tarkov.dev/'+name,{redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Image unavailable');
      const declared=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if(!['image/webp','image/png','image/jpeg','application/octet-stream','binary/octet-stream'].includes(declared)||Number(response.headers.get('content-length'))>MAX_BYTES)throw new Error('Invalid image');
      const reader=response.body.getReader(),chunks=[];let size=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES)throw new Error('Image too large');chunks.push(value);}}
      finally{await reader.cancel().catch(()=>{});}
      const body=Buffer.concat(chunks),type=imageMimeType(body);if(!type)throw new Error('Invalid image contents');
      const entry={at:now(),type,data:body.toString('base64'),etag:'"img-'+createHash('sha256').update(body).digest('hex').slice(0,24)+'"'};
      await store.write('media/'+name+'.json',entry).catch(()=>{});failures.delete(name);return remember(name,entry);
      }finally{release();}
    })().catch(error=>{failures.set(name,now()+15000);while(failures.size>512)failures.delete(failures.keys().next().value);throw error;}).finally(()=>pending.delete(name));
    pending.set(name,task);return task;
  }
  return async(req,url)=>{
    if(!url.pathname.startsWith('/media/'))return null;
    const match=url.pathname.match(route);
    if(!match||!['GET','HEAD'].includes(req.method))return new Response(null,{status:404});
    const name=match[1];let entry=memory.get(name);
    try{
      if(entry){memory.delete(name);memory.set(name,entry);}
      else{
        if(!diskLoads.has(name))diskLoads.set(name,(async()=>{
          const disk=await store.read('media/'+name+'.json').catch(()=>null);
          if(disk?.data&&disk.etag&&Number.isFinite(disk.at)&&disk.data.length<=Math.ceil(MAX_BYTES/3)*4){
            const type=imageMimeType(Buffer.from(disk.data,'base64'));
            if(type)return remember(name,{...disk,type});
          }
          return null;
        })().finally(()=>diskLoads.delete(name)));
        entry=await diskLoads.get(name);
      }
      if(!entry)entry=await refresh(name);
      else if(now()-entry.at>WEEK)refresh(name).catch(()=>{});
      const headers={'Content-Type':entry.type,'Content-Length':String(entry.body.length),'Cache-Control':'public, max-age=2592000, stale-while-revalidate=31536000, stale-if-error=31536000','ETag':entry.etag};
      if((req.headers['if-none-match']||'').split(',').some(tag=>tag.trim()==='*'||tag.trim().replace(/^W\//,'')===entry.etag))return new Response(null,{status:304,headers});
      return new Response(req.method==='HEAD'?null:entry.body,{headers});
    }catch{return new Response(null,{status:502,headers:{'Cache-Control':'no-store','Retry-After':'15'}});}
  };
}
