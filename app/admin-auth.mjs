import { randomBytes,scrypt as derive,timingSafeEqual,createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt=promisify(derive),parameters={N:32768,r:8,p:1,maxmem:64*1024*1024};
export const secretToken=()=>randomBytes(32).toString('base64url');
export const secretDigest=value=>createHash('sha256').update(value).digest('hex');
export async function passwordCredential(password){
  if(typeof password!=='string'||password.length<12||password.length>128||Buffer.byteLength(password)>256)throw new Error('管理员密码需为12–128个字符');
  const salt=randomBytes(32).toString('hex');
  const hash=(await scrypt(password,salt,64,parameters)).toString('hex');
  return {version:1,salt,hash,updatedAt:new Date().toISOString()};
}
export async function verifyPassword(password,credential){
  if(typeof password!=='string'||password.length<1||Buffer.byteLength(password)>256)return false;
  if(credential?.version!==1||!/^[a-f0-9]{64}$/.test(credential.salt||'')||!/^[a-f0-9]{128}$/.test(credential.hash||''))throw new Error('管理员凭据格式错误');
  const actual=await scrypt(password,credential.salt,64,parameters);
  return timingSafeEqual(actual,Buffer.from(credential.hash,'hex'));
}
