export function readJsonBody(req,maxBytes=4096){
  const fail=(status,message)=>Object.assign(new Error(message),{status});
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail(415,'请使用 JSON 请求');
  if(Number(req.headers['content-length']||0)>maxBytes)throw fail(413,'请求过大');
  return new Promise((resolve,reject)=>{
    let size=0,chunks=[],finished=false;
    const done=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);req.off('data',onData);req.off('end',onEnd);req.off('error',onError);if(error){req.resume();reject(error);}else resolve(value);};
    const onData=chunk=>{size+=chunk.length;if(size>maxBytes)done(fail(413,'请求过大'));else chunks.push(chunk);};
    const onEnd=()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();done(null,value);}catch{done(fail(400,'请求格式错误'));}};
    const onError=()=>done(fail(400,'请求中断'));
    const timer=setTimeout(()=>done(fail(408,'请求超时')),5000);timer.unref();
    req.on('data',onData);req.on('end',onEnd);req.on('error',onError);
  });
}
