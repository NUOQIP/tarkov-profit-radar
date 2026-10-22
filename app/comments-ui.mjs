const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const markets={pve:'PVE',regular:'PVP 常规','pvp-season':'PVP 赛季'};
export function commentThreadMarkup(item,market){
  return `<section class="detail-section item-comments" data-comment-thread="${esc(item.id)}" data-comment-market="${esc(market)}"><h3>玩家评论 <span class="count" data-comment-count>—</span></h3>
    <div class="comment-login"><span>登录后参与讨论</span><button type="button" class="primary" data-comment-login>登录</button></div><form class="comment-form" hidden><div class="comment-identity" data-comment-identity></div><label class="comment-trap" aria-hidden="true">网址<input name="website" type="text" tabindex="-1" autocomplete="off"></label><textarea name="text" minlength="2" maxlength="500" required rows="3" aria-label="评论内容" placeholder="刷点、用途，或你的发现…"></textarea><div class="comment-form-actions"><span data-comment-message role="status"></span><span data-comment-length>0/500</span><button type="submit" class="primary">发布</button></div></form>
    <div class="comment-list" data-comment-list aria-live="polite"><p class="comment-empty">读取评论…</p></div><p class="comment-page-message" data-comment-load-message role="status" hidden></p><nav class="comment-pagination" aria-label="评论分页" hidden><button type="button" data-comment-previous aria-label="上一页评论">← 上一页</button><span data-comment-page aria-live="polite">1 / 1</span><button type="button" data-comment-next aria-label="下一页评论">下一页 →</button></nav></section>`;
}
export function mountComments(section,account){
  if(!section||section.dataset.mounted)return;
  section.dataset.mounted='true';
  const item=section.dataset.commentThread,market=section.dataset.commentMarket,form=section.querySelector('form'),list=section.querySelector('[data-comment-list]'),message=section.querySelector('[data-comment-message]');
  const pagination=section.querySelector('.comment-pagination'),previous=section.querySelector('[data-comment-previous]'),next=section.querySelector('[data-comment-next]'),loadMessage=section.querySelector('[data-comment-load-message]');
  let page=1,totalPages=1,busy=false,publishing=false,loaded=false;
  function controls(){
    previous.disabled=busy||publishing||page<=1;next.disabled=busy||publishing||page>=totalPages;
    pagination.hidden=totalPages<=1;section.querySelector('[data-comment-page]').textContent=`${page} / ${totalPages}`;
    form.querySelector('[type=submit]').disabled=busy||publishing;list.setAttribute('aria-busy',String(busy));
  }
  let authorId=account?.user?.id;
  function identity(){
    const user=account?.user;form.hidden=!user;section.querySelector('.comment-login').hidden=Boolean(user);
    section.querySelector('[data-comment-identity]').textContent=user?.nickname||'';
    if(authorId!==user?.id){form.reset();message.textContent='';section.querySelector('[data-comment-length]').textContent='0/500';authorId=user?.id;}
  }
  section.addEventListener('accountchange',identity);section.querySelector('[data-comment-login]').addEventListener('click',()=>account?.open());identity();
  async function request(options={}){
    const params=new URLSearchParams({item,market,page:options.page||1});
    if(options.body)return account.request('/api/comments?'+params,{method:'POST',body:options.body});
    const response=await fetch('/api/comments?'+params,{cache:'no-store',signal:AbortSignal.timeout(20000)});
    const value=await response.json();if(!response.ok)throw new Error(value.error||'评论暂不可用');return value;
  }
  function commentMarkup(comment){
    const date=new Date(comment.createdAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
    return `<article class="player-comment" data-comment-id="${comment.id}"><header><strong>${esc(comment.nickname)}</strong><span class="comment-market">${esc(markets[comment.market]||'')}</span><time datetime="${esc(comment.createdAt)}">${esc(date)}</time></header><p>${esc(comment.text)}</p></article>`;
  }
  async function load(target=1){
    if(busy)return;busy=true;loadMessage.hidden=true;controls();
    try{
      const data=await request({page:target});if(!section.isConnected)return;
      list.innerHTML=data.comments.length?data.comments.map(commentMarkup).join(''):'<p class="comment-empty">还没有评论</p>';
      section.querySelector('[data-comment-count]').textContent=data.total;page=data.page;totalPages=data.totalPages;loaded=true;
    }catch(error){if(!section.isConnected)return;if(!loaded)list.innerHTML=`<button type="button" class="comment-retry">${esc(error.message)} · 重试</button>`;else{loadMessage.textContent=error.message;loadMessage.hidden=false;}}
    finally{busy=false;controls();}
  }
  form.elements.text.addEventListener('input',()=>{section.querySelector('[data-comment-length]').textContent=form.elements.text.value.length+'/500';});
  form.addEventListener('submit',async event=>{
    event.preventDefault();const button=form.querySelector('[type="submit"]');if(busy||publishing)return;
    publishing=true;controls();button.textContent='发布中…';message.textContent='';
    try{
      const text=form.elements.text.value.trim();
      await request({body:{text,website:form.elements.website.value}});
      form.elements.text.value='';section.querySelector('[data-comment-length]').textContent='0/500';message.textContent='已发布';await load(1);
    }catch(error){message.textContent=error.message;}
    finally{publishing=false;button.textContent='发布';controls();}
  });
  previous.addEventListener('click',()=>load(page-1));next.addEventListener('click',()=>load(page+1));list.addEventListener('click',event=>{if(event.target.closest('.comment-retry'))load();});
  load();
}
