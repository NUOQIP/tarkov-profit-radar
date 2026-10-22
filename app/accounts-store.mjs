import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomInt,randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {secretDigest,secretToken} from './admin-auth.mjs';
import {normalizeAccountSettings} from './account-settings.mjs';
import {createPlayerPassword,checkPlayerPassword,validatePlayerPassword} from './player-password.mjs';

export const ACCOUNT_SESSION_SECONDS=90*86400;
export const ACCOUNT_SESSION_MAX_SECONDS=365*86400;
const RENEW_INTERVAL=86400000;
const fail=(status,message,retryAfter)=>Object.assign(new Error(message),{status,retryAfter});
export function normalizeEmail(value){
  if(typeof value!=='string')throw fail(400,'请输入有效邮箱');
  const email=value.trim().toLowerCase(),parts=email.split('@');
  if(email.length>254||parts.length!==2||parts[0].length>64||!parts[0]||parts[0].startsWith('.')||parts[0].endsWith('.')||parts[0].includes('..')||
    !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+$/.test(parts[0])||!parts[1].includes('.')||!parts[1].split('.').every(p=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(p)))throw fail(400,'请输入有效邮箱');
  return email;
}
export function accountNickname(value){
  if(typeof value!=='string')throw fail(400,'昵称需为2–20字');
  const name=value.trim();
  if([...name].length<2||[...name].length>20||/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(name))throw fail(400,'昵称需为2–20字');
  return name;
}
export function createAccountsStore(path,{now=Date.now}={}){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const db=new DatabaseSync(path);
  if(path!==':memory:')chmodSync(path,0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS account_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,nickname TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS account_sessions (token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),expires INTEGER NOT NULL,created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS account_session_user ON account_sessions(user_id);
    CREATE INDEX IF NOT EXISTS account_session_expiry ON account_sessions(expires);
    CREATE TABLE IF NOT EXISTS account_settings (user_id TEXT PRIMARY KEY REFERENCES accounts(id),settings TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS email_challenges (id TEXT PRIMARY KEY,email TEXT NOT NULL,digest TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,sent INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS account_limits (key TEXT PRIMARY KEY,started INTEGER NOT NULL,count INTEGER NOT NULL);`);
  if(!db.prepare('PRAGMA table_info(accounts)').all().some(x=>x.name==='password'))db.exec('ALTER TABLE accounts ADD COLUMN password TEXT');
  if(!db.prepare('PRAGMA table_info(email_challenges)').all().some(x=>x.name==='purpose'))db.exec("ALTER TABLE email_challenges ADD COLUMN purpose TEXT NOT NULL DEFAULT 'login'");
  db.prepare('INSERT OR IGNORE INTO account_meta VALUES (?,?)').run('secret',secretToken());
  const secret=db.prepare('SELECT value FROM account_meta WHERE key=?').get('secret').value;
  const hmac=value=>createHmac('sha256',secret).update(value).digest('hex');
  const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
  const userFields='id,email,nickname,created_at AS createdAt,password IS NOT NULL AS hasPassword';
  const publicUser=row=>row?{...row,hasPassword:Boolean(row.hasPassword)}:null;
  const userByEmail=email=>publicUser(db.prepare('SELECT '+userFields+' FROM accounts WHERE email=?').get(email));
  const sessionQuery=db.prepare('SELECT user_id,expires,created FROM account_sessions WHERE token=?');
  const renewSession=db.prepare('UPDATE account_sessions SET expires=? WHERE token=? AND expires>?');
  const sessionUser=db.prepare('SELECT '+userFields+' FROM accounts WHERE id=?');
  function throttle(key,count,window){
    const hashed=hmac('rate:'+key),stamp=now();
    const record=db.prepare('SELECT * FROM account_limits WHERE key=?').get(hashed);
    if(record&&stamp-record.started<window){
      if(record.count>=count)throw fail(429,'操作太频繁，请稍后再试',Math.ceil((record.started+window-stamp)/1000));
      db.prepare('UPDATE account_limits SET count=count+1 WHERE key=?').run(hashed);
    }else db.prepare('INSERT OR REPLACE INTO account_limits VALUES (?,?,1)').run(hashed,stamp);
  }
  function cleanup(){
    db.prepare('DELETE FROM email_challenges WHERE expires<=?').run(now());
    db.prepare('DELETE FROM account_sessions WHERE expires<=?').run(now());
    db.prepare('DELETE FROM account_limits WHERE started<?').run(now()-86400000);
  }
  async function sendCode(value,ip,deliver,purpose='login'){
    if(!['login','register','password'].includes(purpose))throw fail(400,'验证码用途无效');
    const email=normalizeEmail(value);cleanup();
    throttle('send:ip:'+ip,20,3600000);throttle('send:email:'+email,6,3600000);throttle('send:cooldown:'+email,1,60000);throttle('send:global',300,3600000);
    const challenge=randomBytes(24).toString('base64url'),code=String(randomInt(1000000)).padStart(6,'0');
    db.prepare('DELETE FROM email_challenges WHERE email=?').run(email);
    db.prepare('INSERT INTO email_challenges(id,email,digest,expires,purpose) VALUES (?,?,?,?,?)').run(challenge,email,hmac(challenge+':'+code),now()+600000,purpose);
    try{await deliver({email,code,purpose});db.prepare('UPDATE email_challenges SET sent=1 WHERE id=?').run(challenge);}
    catch{db.prepare('DELETE FROM email_challenges WHERE id=?').run(challenge);throw fail(503,'验证码发送失败，请稍后重试');}
    return {challenge,retryAfter:60,expiresIn:600};
  }
  function verifyProof({email:address,challenge,code},ip,purpose){
    const email=normalizeEmail(address);throttle('verify:ip:'+ip,30,900000);
    if(typeof challenge!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(challenge)||typeof code!=='string'||!/^\d{6}$/.test(code))throw fail(400,'请输入6位验证码');
    const proof=db.prepare('SELECT * FROM email_challenges WHERE id=?').get(challenge);
    if(!proof||proof.email!==email||proof.purpose!==purpose||!proof.sent||proof.expires<=now()||proof.attempts>=5)throw fail(400,'验证码已失效，请重新获取');
    db.prepare('UPDATE email_challenges SET attempts=attempts+1 WHERE id=?').run(challenge);
    if(!same(proof.digest,hmac(challenge+':'+code)))throw fail(400,'验证码不正确');
    return email;
  }
  function consumeProof(email,challenge,purpose){
    const consumed=db.prepare('DELETE FROM email_challenges WHERE id=? AND email=? AND purpose=? AND sent=1 AND expires>? AND attempts<=5').run(challenge,email,purpose,now());
    if(consumed.changes!==1)throw fail(400,'验证码已失效，请重新获取');
    db.prepare('DELETE FROM email_challenges WHERE email=?').run(email);
  }
  function newUser(email,password=null){
    if(db.prepare('SELECT count(*) AS n FROM accounts').get().n>=100000)throw fail(503,'暂时无法注册');
    const id=randomUUID(),nickname='SCAV-'+randomBytes(3).toString('hex').toUpperCase(),createdAt=new Date(now()).toISOString();
    db.prepare('INSERT INTO accounts (id,email,nickname,created_at,password) VALUES (?,?,?,?,?)').run(id,email,nickname,createdAt,password);
    return userByEmail(email);
  }
  function issueSession(user,created=false){
    const token=secretToken(),stamp=now(),expiresAt=stamp+ACCOUNT_SESSION_SECONDS*1000;
    db.prepare('INSERT INTO account_sessions VALUES (?,?,?,?)').run(secretDigest(token),user.id,expiresAt,stamp);
    db.prepare('DELETE FROM account_sessions WHERE user_id=? AND token NOT IN (SELECT token FROM account_sessions WHERE user_id=? ORDER BY created DESC LIMIT 10)').run(user.id,user.id);
    return {user,created,token,expiresAt,csrf:hmac('csrf:'+token),...settings(user.id)};
  }
  function transaction(action){
    db.exec('BEGIN IMMEDIATE');
    try{const result=action();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}
  }
  function verifyCode(proof,ip){
    const email=verifyProof(proof,ip,'login');
    return transaction(()=>{consumeProof(email,proof.challenge,'login');const user=userByEmail(email);return issueSession(user||newUser(email),!user);});
  }
  async function register(proof,ip){
    validatePlayerPassword(proof.password);const email=verifyProof(proof,ip,'register');
    const password=await createPlayerPassword(proof.password);
    return transaction(()=>{
      consumeProof(email,proof.challenge,'register');
      if(userByEmail(email))throw fail(409,'邮箱已注册，请直接登录或找回密码');
      return issueSession(newUser(email,password),true);
    });
  }
  async function loginPassword({email:value,password},ip){
    const email=normalizeEmail(value);cleanup();
    throttle('password:ip:'+ip,30,900000);throttle('password:email:'+email,12,900000);throttle('password:global',300,900000);
    const before=db.prepare('SELECT password FROM accounts WHERE email=?').get(email)?.password||null;
    const matched=await checkPlayerPassword(password,before);
    // A reset while scrypt is running must invalidate the old credential.
    const current=db.prepare('SELECT password FROM accounts WHERE email=?').get(email)?.password||null;
    if(!matched||current!==before)throw fail(401,'邮箱或密码不正确');
    return transaction(()=>issueSession(userByEmail(email)));
  }
  async function resetPassword(proof,ip){
    validatePlayerPassword(proof.password);const email=verifyProof(proof,ip,'password');
    const password=await createPlayerPassword(proof.password);
    return transaction(()=>{
      consumeProof(email,proof.challenge,'password');const user=userByEmail(email);
      if(!user)throw fail(400,'邮箱尚未注册，请先注册');
      db.prepare('UPDATE accounts SET password=? WHERE id=?').run(password,user.id);
      db.prepare('DELETE FROM account_sessions WHERE user_id=?').run(user.id);
      return issueSession(userByEmail(email));
    });
  }
  function authenticate(token,{renew=false}={}){
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
    const key=secretDigest(token),stamp=now(),session=sessionQuery.get(key);
    if(!session||session.expires<=stamp||session.created+ACCOUNT_SESSION_MAX_SECONDS*1000<=stamp)return null;
    const user=publicUser(sessionUser.get(session.user_id));
    if(!user)return null;
    const until=Math.min(stamp+ACCOUNT_SESSION_SECONDS*1000,session.created+ACCOUNT_SESSION_MAX_SECONDS*1000);
    const renewed=renew&&until-session.expires>=RENEW_INTERVAL;
    if(renewed){renewSession.run(until,key,stamp);session.expires=until;}
    return {user,csrf:hmac('csrf:'+token),key,expiresAt:session.expires,renewed};
  }
  function settings(id){
    const row=db.prepare('SELECT settings,revision,updated_at AS updatedAt FROM account_settings WHERE user_id=?').get(id);
    return row?{...row,settings:JSON.parse(row.settings)}:{settings:null,revision:0,updatedAt:null};
  }
  function saveSettings(id,input,revision){
    if(!Number.isSafeInteger(revision)||revision<0)throw fail(400,'设置版本无效');
    const value=normalizeAccountSettings(input),encoded=JSON.stringify(value);
    if(Buffer.byteLength(encoded)>450000)throw fail(413,'设置过大');
    db.exec('BEGIN IMMEDIATE');
    try{
      const current=settings(id);
      if(current.revision!==revision)throw Object.assign(fail(409,'设置在其他设备更新了'),{current});
      if(JSON.stringify(current.settings)!==encoded){
        db.prepare('INSERT INTO account_settings VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET settings=excluded.settings,revision=excluded.revision,updated_at=excluded.updated_at').run(id,encoded,revision+1,new Date(now()).toISOString());
      }
      db.exec('COMMIT');return settings(id);
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function rename(id,name){
    name=accountNickname(name);throttle('rename:'+id,10,3600000);
    db.prepare('UPDATE accounts SET nickname=? WHERE id=?').run(name,id);
    return publicUser(db.prepare('SELECT '+userFields+' FROM accounts WHERE id=?').get(id));
  }
  function logout(session,all=false){
    if(all)db.prepare('DELETE FROM account_sessions WHERE user_id=?').run(session.user.id);
    else db.prepare('DELETE FROM account_sessions WHERE token=?').run(session.key);
  }
  return {sendCode,verifyCode,register,loginPassword,resetPassword,authenticate,settings,saveSettings,rename,logout,close:()=>db.close()};
}
