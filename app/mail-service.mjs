import nodemailer from 'nodemailer';
import {readFile,mkdir,writeFile,rename,chmod} from 'node:fs/promises';
import {dirname} from 'node:path';
import {normalizeEmail} from './accounts-store.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const MAIL_PRESETS={qq:{host:'smtp.qq.com',port:465},exmail:{host:'smtp.exmail.qq.com',port:465},netease163:{host:'smtp.163.com',port:465},netease126:{host:'smtp.126.com',port:465},custom:{host:'',port:465}};
export function createMailService(path,{transport=nodemailer.createTransport}={}){
  let busy=0;
  const read=async()=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}};
  const summary=c=>({enabled:c?.enabled===true,configured:Boolean(c?.password),provider:c?.provider||'qq',host:c?.host||'smtp.qq.com',port:c?.port||465,user:c?.user||'',from:c?.from||'',passwordSet:Boolean(c?.password)});
  async function status(){return summary(await read());}
  async function save(value){
    if(!value||Object.keys(value).some(k=>!['enabled','provider','host','port','user','from','password'].includes(k)))throw fail(400,'邮件设置无效');
    const previous=await read(),provider=Object.hasOwn(MAIL_PRESETS,value.provider)?value.provider:'custom';
    const host=provider==='custom'?String(value.host||'').trim():MAIL_PRESETS[provider].host,port=provider==='custom'?Number(value.port):465;
    if(!/^[a-z0-9][a-z0-9.-]{1,252}[a-z0-9]$/i.test(host)||!host.includes('.')||!['465','587','25'].includes(String(port)))throw fail(400,'请输入 SMTP 主机，端口为465、587或25');
    const user=normalizeEmail(value.user),from=normalizeEmail(value.from||user);
    if(typeof value.password!=='string'||value.password.length>1000||/[\r\n\0]/.test(value.password))throw fail(400,'授权码无效');
    const sameIdentity=previous?.host===host&&previous?.user===user;
    const password=value.password||(sameIdentity?previous?.password:null);
    if(!password)throw fail(400,'请填写邮箱授权码');
    const config={enabled:value.enabled===true,provider,host,port,user,from,password};
    await mkdir(dirname(path),{recursive:true,mode:0o700});
    const temp=path+'.partial';await writeFile(temp,JSON.stringify(config),{mode:0o600});await chmod(temp,0o600);await rename(temp,path);return summary(config);
  }
  async function connection(){
    const c=await read();if(!c?.enabled||!c.password)throw fail(503,'邮箱服务尚未配置');
    return {config:c,client:transport({host:c.host,port:c.port,secure:c.port===465,requireTLS:true,tls:{minVersion:'TLSv1.2'},auth:{user:c.user,pass:c.password},
      connectionTimeout:15000,greetingTimeout:10000,socketTimeout:20000,dnsTimeout:10000,disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false})};
  }
  async function verify(){
    const {client}=await connection();try{await client.verify();return {ok:true};}catch{throw fail(503,'连接失败，请检查 SMTP 地址和授权码');}finally{client.close();}
  }
  async function send({email,code,purpose='login'}){
    if(busy>=3)throw fail(503,'邮件服务繁忙');busy++;
    let client;
    try{
      const active=await connection();client=active.client;
      const action={login:'登录',register:'注册',password:'设置密码'}[purpose]||'登录';
      const result=await client.sendMail({from:{name:'塔科夫赚钱监控',address:active.config.from},to:normalizeEmail(email),subject:action+'验证码 · 塔科夫赚钱监控',
        text:`你正在${action}，验证码：${code}\n\n10分钟内有效。请勿向他人提供验证码。\n如果不是你本人操作，请忽略本邮件。`});
      if(result.rejected?.length||!result.accepted?.length)throw fail(503,'邮件未被接收');
    }finally{busy--;client?.close();}
  }
  return {status,save,verify,send};
}
