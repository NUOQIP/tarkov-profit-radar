import {DatabaseSync} from 'node:sqlite';
import {createHmac,randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {MARKETS} from './model.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function createCommentsStore(path,{now=Date.now}={}){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o750});
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,item_id TEXT NOT NULL,item_name TEXT NOT NULL,
      nickname TEXT NOT NULL,body TEXT NOT NULL,market TEXT NOT NULL,created_at TEXT NOT NULL,
      author TEXT NOT NULL,hidden INTEGER NOT NULL DEFAULT 0,moderated_at TEXT);
    CREATE INDEX IF NOT EXISTS comments_item ON comments(item_id,id DESC);
    CREATE INDEX IF NOT EXISTS comments_author ON comments(author,created_at);
    CREATE INDEX IF NOT EXISTS comments_time ON comments(created_at);`);
  if(!db.prepare('PRAGMA table_info(comments)').all().some(c=>c.name==='user_id'))db.exec('ALTER TABLE comments ADD COLUMN user_id TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS comments_user ON comments(user_id,created_at)');
  db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('author-secret',randomBytes(32).toString('hex'));
  const secret=db.prepare('SELECT value FROM settings WHERE key=?').get('author-secret').value;
  const fields='id,item_id AS itemId,item_name AS itemName,nickname,body AS text,market,created_at AS createdAt,hidden';
  const read=db.prepare('SELECT '+fields+' FROM comments WHERE id=?');
  function list({itemId,moderation=false,q='',cursor,limit=20,page}={}){
    if(itemId&&!/^[a-f0-9]{24}$/.test(itemId))throw fail(400,'物品无效');
    const after=cursor===undefined||cursor===null||cursor===''?Number.MAX_SAFE_INTEGER:Number(cursor);
    if(!Number.isSafeInteger(after)||after<1)throw fail(400,'分页无效');
    limit=Math.max(1,Math.min(40,Math.floor(Number(limit)||20)));
    const paged=page!==undefined,requestedPage=paged?Number(page):1;
    if(paged&&(!Number.isSafeInteger(requestedPage)||requestedPage<1||requestedPage>100000||cursor))throw fail(400,'分页无效');
    const search=String(q||'').trim().slice(0,160),pattern='%'+search.replace(/[\\%_]/g,'\\$&')+'%';
    const where=`(${moderation?'1=1':'hidden=0'}) AND (? IS NULL OR item_id=?) AND (?='' OR body LIKE ? ESCAPE '\\' OR nickname LIKE ? ESCAPE '\\' OR item_name LIKE ? ESCAPE '\\' OR item_id=?)`;
    const params=[itemId||null,itemId||null,search,pattern,pattern,pattern,search];
    const total=db.prepare('SELECT count(*) AS total FROM comments WHERE '+where).get(...params).total;
    const totalPages=Math.max(1,Math.ceil(total/limit)),currentPage=Math.min(requestedPage,totalPages);
    const rows=db.prepare('SELECT '+fields+' FROM comments WHERE '+where+' AND id<? ORDER BY id DESC LIMIT ? OFFSET ?').all(...params,after,limit+1,paged?(currentPage-1)*limit:0);
    const more=rows.length>limit;rows.splice(limit);
    const comments=rows.map(row=>moderation?{...row,hidden:Boolean(row.hidden)}:Object.fromEntries(Object.entries(row).filter(([key])=>key!=='hidden')));
    return {comments,total,nextCursor:more?rows.at(-1).id:null,...(paged?{page:currentPage,pageSize:limit,totalPages}:{})};
  }
  function add({item,nickname='',text,market},ip,user){
    if(!user?.id||!user.nickname)throw fail(401,'请先登录');
    nickname=user.nickname;
    if(!/^[a-f0-9]{24}$/.test(item?.id)||!Object.hasOwn(MARKETS,market))throw fail(400,'物品或市场无效');
    if(typeof nickname!=='string'||typeof text!=='string')throw fail(400,'评论格式无效');
    nickname=nickname.trim()||'SCAV';text=text.trim();
    if([...nickname].length>20||/[\r\n\t]/.test(nickname)||[...text].length<2||[...text].length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(nickname+text))throw fail(400,'昵称最多20字，评论2–500字');
    const author=createHmac('sha256',secret).update(String(ip)).digest('hex'),stamp=new Date(now()).toISOString(),since=new Date(now()-300000).toISOString();
    db.exec('BEGIN IMMEDIATE');
    try{
      if(db.prepare('SELECT count(*) AS n FROM comments WHERE (author=? OR user_id=?) AND created_at>?').get(author,user.id,since).n>=3||db.prepare('SELECT count(*) AS n FROM comments WHERE created_at>?').get(since).n>=120)throw fail(429,'发布太频繁，请稍后再试');
      if(db.prepare('SELECT id FROM comments WHERE user_id=? AND item_id=? AND body=? AND created_at>?').get(user.id,item.id,text,new Date(now()-86400000).toISOString()))throw fail(409,'这条评论已经发布过了');
      if(db.prepare('SELECT count(*) AS n FROM comments').get().n>=100000)throw fail(503,'评论暂不可用');
      const inserted=db.prepare('INSERT INTO comments(item_id,item_name,nickname,body,market,created_at,author,user_id) VALUES (?,?,?,?,?,?,?,?)').run(item.id,item.name||item.id,nickname,text,market,stamp,author,user.id);
      db.exec('COMMIT');
      const row=read.get(Number(inserted.lastInsertRowid));delete row.hidden;return row;
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function moderate(id,hidden){
    if(!Number.isSafeInteger(Number(id))||Number(id)<1||typeof hidden!=='boolean')throw fail(400,'评论设置无效');
    const changed=db.prepare('UPDATE comments SET hidden=?,moderated_at=? WHERE id=?').run(Number(hidden),new Date(now()).toISOString(),Number(id));
    if(!changed.changes)throw fail(404,'评论不存在');
    return {ok:true};
  }
  return {list,add,moderate,close:()=>db.close()};
}
