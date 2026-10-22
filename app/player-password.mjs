import {randomBytes,scrypt as derive,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(derive),parameters={N:32768,r:8,p:3,maxmem:64*1024*1024};
let active=0;
const dummy={version:1,salt:randomBytes(32).toString('hex'),hash:'0'.repeat(128)};
export function validatePlayerPassword(value){
  if(typeof value!=='string'||value.length<8||value.length>128||Buffer.byteLength(value)>512)throw Object.assign(new Error('密码需为8–128个字符'),{status:400});
  return value;
}
async function digest(password,salt){
  if(active>=2)throw Object.assign(new Error('登录繁忙，请稍后重试'),{status:503,retryAfter:2});
  active++;
  try{return await scrypt(password,salt,64,parameters);}finally{active--;}
}
export async function createPlayerPassword(password){
  validatePlayerPassword(password);
  const salt=randomBytes(32).toString('hex'),hash=(await digest(password,salt)).toString('hex');
  return JSON.stringify({version:1,salt,hash});
}
export async function checkPlayerPassword(password,encoded){
  if(typeof password!=='string'||!password.length||password.length>128||Buffer.byteLength(password)>512)return false;
  let record;try{record=JSON.parse(encoded||'null');}catch{}
  const valid=record?.version===1&&/^[a-f0-9]{64}$/.test(record.salt||'')&&/^[a-f0-9]{128}$/.test(record.hash||'');
  const credential=valid?record:dummy,actual=await digest(password,credential.salt);
  return timingSafeEqual(actual,Buffer.from(credential.hash,'hex'))&&Boolean(valid);
}
