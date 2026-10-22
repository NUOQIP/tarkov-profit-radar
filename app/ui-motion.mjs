// Presentation only. Market, account, profile and valuation state stay in app.js.
export function createInterfaceMotion(){
  const query=selector=>document.querySelector(selector);
  const system=matchMedia('(prefers-reduced-motion: reduce)');
  let preference=false;
  try{preference=localStorage.getItem('loot-radar-motion')==='reduce';}catch{}
  const reduced=()=>preference||system.matches;
  const animations=new WeakMap(),dialogs=new WeakMap();
  const settle='cubic-bezier(.16,1,.3,1)',leave='cubic-bezier(.4,0,.6,1)';
  const stop=(element)=>animations.get(element)?.cancel();
  function play(element,frames,options={}){
    if(!element)return Promise.resolve();
    stop(element);
    if(reduced())return Promise.resolve();
    const animation=element.animate(frames,{duration:280,easing:settle,fill:'both',...options});
    animations.set(element,animation);
    return animation.finished.catch(()=>{}).finally(()=>{
      if(animations.get(element)===animation){animations.delete(element);animation.cancel();}
    });
  }
  function syncMotion(){
    document.documentElement.dataset.motion=reduced()?'reduce':'full';
    const control=query('#motion-preference');
    if(control){
      control.setAttribute('aria-pressed',String(!reduced()));
      const label=reduced()?'界面动效：轻简，点击切换完整':'界面动效：完整，点击切换轻简';
      control.setAttribute('aria-label',label);control.title=label;
    }
  }
  function toggle(){preference=!reduced();try{localStorage.setItem('loot-radar-motion',preference?'reduce':'full');}catch{}syncMotion();}
  system.addEventListener('change',syncMotion);syncMotion();
  const key=element=>element.dataset.row||element.dataset.cloudId;
  function visible(root){
    if(!root)return [];
    const clip=root.getBoundingClientRect();
    return [...root.querySelectorAll('.card,.quicklook-tile')].map(element=>({element,rect:element.getBoundingClientRect()}))
      .filter(({rect})=>rect.bottom>clip.top&&rect.top<clip.bottom&&rect.right>clip.left&&rect.left<clip.right).slice(0,80);
  }
  function capture(root){return reduced()?null:new Map(visible(root).map(({element,rect})=>[key(element),rect]));}
  function reflow(root,before){
    if(!root||reduced())return;
    visible(root).forEach(({element,rect},index)=>{
      const old=before?.get(key(element)),dx=old?old.left-rect.left:0,dy=old?old.top-rect.top:7;
      if(old&&Math.abs(dx)<1&&Math.abs(dy)<1)return;
      const near=old&&Math.abs(dx)<root.clientWidth*.6&&Math.abs(dy)<root.clientHeight*.6;
      play(element,[{opacity:near?.8:0,transform:`translate(${near?dx:0}px,${near?dy:7}px)`},{opacity:1,transform:'translate(0,0)'}],{duration:near?300:240,delay:old?0:Math.min(index*8,48)});
    });
  }
  function changePage(update,direction=1){
    const stage=query('#market-stage'),content=query('#monitor-panel');
    stage.querySelectorAll('.scene-out').forEach(element=>element.remove());
    let ghost;
    if(!reduced()){
      ghost=document.createElement('div');ghost.className='scene-out';ghost.inert=true;ghost.setAttribute('aria-hidden','true');
      const bounds=stage.getBoundingClientRect();
      const cloud=stage.querySelector('.quicklook-board');
      let host=ghost;
      if(cloud){host=document.createElement('div');host.className='quicklook-unified';ghost.append(host);}
      const root=stage.querySelector('[data-module]:not([hidden]) .list');
      for(const {element,rect}of visible(root)){
        const copy=element.cloneNode(true);copy.removeAttribute('id');copy.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
        Object.assign(copy.style,{position:'absolute',left:`${rect.left-bounds.left}px`,top:`${rect.top-bounds.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,margin:'0',transform:'none'});
        host.append(copy);
      }
      stage.append(ghost);
    }
    stop(content);update();
    if(ghost)play(ghost,[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-direction*8}px)`}],{duration:150,easing:leave}).then(()=>ghost.remove());
    play(content,[{opacity:.1,transform:`translateX(${direction*16}px)`},{opacity:1,transform:'translateX(0)'}],{duration:310});
  }
  function nav(){
    const root=query('.workspace-nav'),active=root.querySelector('[data-page][aria-pressed=true]');
    if(!active)return;
    let marker=root.querySelector('.nav-cursor');
    if(!marker){marker=document.createElement('span');marker.className='nav-cursor';marker.setAttribute('aria-hidden','true');root.prepend(marker);}
    const before=marker.getBoundingClientRect(),bounds=root.getBoundingClientRect(),after=active.getBoundingClientRect(),first=!marker.dataset.ready;
    Object.assign(marker.style,{top:`${after.top-bounds.top}px`,left:`${after.left-bounds.left}px`,width:`${after.width}px`,height:`${after.height}px`});marker.dataset.ready='true';
    if(!first)play(marker,[{transform:`translate(${before.left-after.left}px,${before.top-after.top}px)`},{transform:'translate(0,0)'}],{duration:330});
  }
  function open(dialog,source=document.activeElement){
    let record=dialogs.get(dialog);
    if(dialog.open&&!record?.closing)return;
    if(record?.closing){record.token++;record.closing=false;dialog.classList.remove('is-closing');stop(dialog);return;}
    const row=source?.closest?.('.card,.quicklook-tile');
    record={source:source?.matches?.('.card')?source.querySelector('.card-main'):source,row,rowId:row?.dataset.row||row?.dataset.cloudId,token:0,closing:false};dialogs.set(dialog,record);
    dialog.classList.add('motion-managed');row?.classList.add('source-active');
    dialog.showModal();
    const horizontal=innerWidth>700;
    play(dialog,[{opacity:.35,transform:horizontal?'translateX(56px)':'translateY(28px)'},{opacity:1,transform:'translate(0,0)'}],{duration:340});
    const identity=dialog.querySelector('.detail-identity,.account-hero');
    if(identity)play(identity,[{opacity:.2,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:330,delay:45});
  }
  function close(dialog,value='cancel'){
    if(!dialog?.open)return Promise.resolve();
    let record=dialogs.get(dialog);
    if(record?.closing)return record.promise;
    if(!record){record={token:0};dialogs.set(dialog,record);}
    const token=++record.token,style=getComputedStyle(dialog),from={opacity:style.opacity,transform:style.transform};
    record.closing=true;dialog.classList.add('is-closing');
    record.promise=play(dialog,[from,{opacity:0,transform:innerWidth>700?'translateX(36px)':'translateY(22px)'}],{duration:210,easing:leave}).then(()=>{
      if(record.token!==token)return;
      dialog.close(value);dialog.classList.remove('is-closing');record.row?.classList.remove('source-active');
      record.closing=false;
      requestAnimationFrame(()=>{
        if(document.querySelector('dialog[open]'))return;
        const current=record.source?.isConnected?record.source:record.rowId?[...document.querySelectorAll('.card-main[data-open],.quicklook-tile[data-open]')].find(el=>el.dataset.open===record.rowId):null;
        current?.focus?.({preventScroll:true});
      });
    });
    return record.promise;
  }
  function swap(root,back=false){
    play(root,[{opacity:.25,transform:`translateX(${back?-12:12}px)`},{opacity:1,transform:'translateX(0)'}],{duration:250});
  }
  function favorite(id){
    document.querySelectorAll('[data-favorite]').forEach(el=>{if(el.dataset.favorite===id)play(el.querySelector('svg'),[{transform:'scale(.75)'},{transform:'scale(1.16)',offset:.55},{transform:'scale(1)'}],{duration:300});});
  }
  new ResizeObserver(nav).observe(query('.workspace-nav'));
  return {open,close,swap,capture,reflow,changePage,nav,favorite,play,toggle,syncMotion,reduced};
}
