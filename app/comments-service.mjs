import {MARKETS} from './model.mjs';
import {readJsonBody} from './http-body.mjs';
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
export function createCommentsHandler(comments,{findItem,requireUser}={}){
  return async(req,url,context)=>{
    if(url.pathname!=='/api/comments')return null;
    try{
      const itemId=url.searchParams.get('item'),market=url.searchParams.get('market')||'pve';
      if(!/^[a-f0-9]{24}$/.test(itemId||'')||!Object.hasOwn(MARKETS,market))return json({error:'物品或市场无效'},400);
      const item=await findItem(itemId,market);if(!item)return json({error:'物品不存在'},404);
      if(req.method==='GET'){
        const cursor=url.searchParams.get('cursor'),page=url.searchParams.has('page')?url.searchParams.get('page'):(cursor?undefined:1);
        return json(comments.list({itemId,cursor,page,limit:5}));
      }
      if(req.method!=='POST')return json({error:'请求方式无效'},405,{'Allow':'GET, POST'});
      const origin=new URL(`${context.secure?'https:':'http:'}//${req.headers.host}`).origin;
      if(req.headers.origin!==origin)return json({error:'请从物品页面发布'},403);
      const session=requireUser?.(req,context);if(!session)return json({error:'请先登录'},401);
      const body=await readJsonBody(req,4096);
      if(Object.keys(body).some(k=>!['text','website'].includes(k))||body.website)return json({error:'评论格式无效'},400);
      return json({comment:comments.add({item,text:body.text,market},context.ip,session.user)},201);
    }catch(error){return json({error:error.status?error.message:'评论暂不可用'},error.status||500,error.status===429?{'Retry-After':'300'}:{});}
  };
}
