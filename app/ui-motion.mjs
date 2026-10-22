// Presentation only. Market, account, profile and valuation state stay in app.js.
export function createInterfaceMotion(){
  const query=selector=>document.querySelector(selector);
  const system=matchMedia('(prefers-reduced-motion: reduce)');
  const reduced=()=>system.matches;
  const animations=new Map(),dialogs=new WeakMap(),watchedDialogs=new WeakSet();
  const settle='cubic-bezier(.2,.8,.2,1)',leave='cubic-bezier(.4,0,1,1)';
  const stop=element=>animations.get(element)?.cancel();
  function stopWithin(root){
    if(root)for(const [element,animation]of animations)if(element===root||root.contains(element))animation.cancel();
  }
  function play(element,frames,options={}){
    if(!element)return Promise.resolve();
    stop(element);
    if(reduced()||typeof element.animate!=='function')return Promise.resolve();
    const animation=element.animate(frames,{duration:300,easing:settle,fill:'both',...options});
    animations.set(element,animation);
    return animation.finished.catch(()=>{}).finally(()=>{
      if(animations.get(element)===animation)animations.delete(element);
      animation.cancel();
    });
  }
  function syncMotion(){
    document.documentElement.dataset.motion=reduced()?'reduce':'full';
    if(reduced()){
      for(const animation of animations.values())animation.cancel();
      animations.clear();
      document.querySelectorAll('.scene-out').forEach(element=>element.remove());
    }
  }
  system.addEventListener('change',syncMotion);syncMotion();
  const key=element=>element.dataset.row||element.dataset.cloudId||element.dataset.open;
  const rowSelector='.card,.quicklook-tile,.catalog-table tbody tr[data-open]';
  function visible(root){
    if(!root)return [];
    const bounds=root.getBoundingClientRect(),clip={top:Math.max(0,bounds.top),bottom:Math.min(innerHeight,bounds.bottom),left:Math.max(0,bounds.left),right:Math.min(innerWidth,bounds.right)},result=[];
    for(const element of root.querySelectorAll(rowSelector)){
      const rect=element.getBoundingClientRect();
      if(rect.width&&rect.height&&rect.bottom>clip.top&&rect.top<clip.bottom&&rect.right>clip.left&&rect.left<clip.right){
        result.push({element,rect});
        if(result.length===60)break;
      }
    }
    return result;
  }
  function capture(root){return reduced()?null:new Map(visible(root).filter(({element})=>key(element)).map(({element,rect})=>[key(element),rect]));}
  function reflow(root,before){
    if(!root||reduced())return;
    const rows=visible(root);
    // Existing rows retain their opacity. Only genuinely new rows enter.
    rows.forEach(({element,rect},index)=>{
      const old=before?.get(key(element)),dx=old?old.left-rect.left:0,dy=old?old.top-rect.top:0;
      const sx=old?.width/rect.width||1,sy=old?.height/rect.height||1;
      if(old&&Math.abs(dx)<1&&Math.abs(dy)<1&&Math.abs(sx-1)<.01&&Math.abs(sy-1)<.01)return;
      const near=old&&Math.abs(dx)<Math.max(root.clientWidth*.65,100)&&Math.abs(dy)<Math.max(root.clientHeight*.65,100)&&Math.abs(sx-1)<.22&&Math.abs(sy-1)<.22;
      play(element,[
        {opacity:old?1:0,transform:near?`translate(${dx}px,${dy}px) scale(${sx},${sy})`:'translateY(6px)',transformOrigin:'0 0'},
        {opacity:1,transform:'translate(0,0) scale(1)',transformOrigin:'0 0'}
      ],{duration:near?Math.min(400,270+Math.hypot(dx,dy)*.16):270,delay:old?0:Math.min(index*14,84)});
    });
  }
  function reveal(element,{direction=1,delay=0,duration=360,distance=10}={}){
    return play(element,[
      {opacity:0,transform:`translateX(${direction*distance}px)`,clipPath:direction>0?'inset(0 8% 0 0)':'inset(0 0 0 8%)'},
      {opacity:1,transform:'translateX(0)',clipPath:'inset(0 0 0 0)'}
    ],{duration,delay});
  }
  function changePage(update,direction=1){
    const stage=query('#market-stage'),content=query('#monitor-panel');
    stage?.querySelectorAll('.scene-out').forEach(element=>{stop(element);element.remove();});
    let ghost;
    if(stage&&!reduced()){
      const rows=visible(stage.querySelector('[data-module]:not([hidden]) .list')).filter(({element})=>element.matches('.card,.quicklook-tile')).slice(0,12);
      if(rows.length){
        ghost=document.createElement('div');ghost.className='scene-out';ghost.inert=true;ghost.setAttribute('aria-hidden','true');
        const bounds=stage.getBoundingClientRect();
        let host=ghost;
        if(rows[0].element.matches('.quicklook-tile')){host=document.createElement('div');host.className='quicklook-unified';ghost.append(host);}
        for(const {element,rect}of rows){
          const copy=element.cloneNode(true);copy.removeAttribute('id');copy.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
          Object.assign(copy.style,{position:'absolute',left:`${rect.left-bounds.left}px`,top:`${rect.top-bounds.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,margin:'0',transform:'none'});
          host.append(copy);
        }
        stage.append(ghost);
      }
    }
    stopWithin(content);
    try{update();}catch(error){ghost?.remove();throw error;}
    if(ghost)play(ghost,[{opacity:.8,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-direction*6}px)`}],{duration:160,easing:leave}).then(()=>ghost.remove());
    reveal(query('.page-heading'),{direction,distance:7,duration:300});
    reveal(query('.context-toolbar'),{direction,distance:5,delay:35,duration:300});
    return reveal(content,{direction,distance:12,delay:55,duration:390});
  }
  function nav(){
    const root=query('.workspace-nav'),active=root?.querySelector('[data-page][aria-pressed=true]');
    if(!active)return;
    let marker=root.querySelector('.nav-cursor');
    if(!marker){marker=document.createElement('span');marker.className='nav-cursor';marker.setAttribute('aria-hidden','true');root.prepend(marker);}
    const target=active.getBoundingClientRect(),bounds=root.getBoundingClientRect();
    if(!target.width||!target.height)return;
    const layout=[target.top-bounds.top+root.scrollTop,target.left-bounds.left+root.scrollLeft,target.width,target.height];
    const signature=layout.map(value=>value.toFixed(2)).join(':');
    // Rendering fresh market data must not restart an unfinished navigation slide.
    if(marker.dataset.layout===signature)return;
    const before=marker.getBoundingClientRect(),first=!marker.dataset.ready;
    root.querySelectorAll('[data-page]').forEach(button=>button.style.removeProperty('background'));
    active.style.background='transparent';
    Object.assign(marker.style,{top:`${layout[0]}px`,left:`${layout[1]}px`,width:`${layout[2]}px`,height:`${layout[3]}px`,transformOrigin:'0 0'});
    marker.dataset.ready='true';marker.dataset.layout=signature;
    if(!first)play(marker,[
      {transform:`translate(${before.left-target.left}px,${before.top-target.top}px) scale(${before.width/target.width},${before.height/target.height})`},
      {transform:'translate(0,0) scale(1)'}
    ],{duration:340});
  }
  function dialogLayers(dialog){
    return [...dialog.querySelectorAll('.drawer-top,.dialog-heading,.detail-identity,.detail-metrics,.detail-section,.settings-tabs,.settings-scroll,.account-hero,[data-auth-pane],[data-member-pane],.dialog-actions,#info-content')]
      .filter(element=>!element.hidden&&!element.closest('[hidden]')).slice(0,8);
  }
  function pose(element){const style=getComputedStyle(element);return {opacity:style.opacity,transform:style.transform};}
  function open(dialog,source=document.activeElement){
    if(!dialog)return;
    let record=dialogs.get(dialog);
    if(dialog.open&&!record?.closing)return;
    const resume=dialog.open&&record?.closing,from=resume?pose(dialog):null;
    const layerPoses=new Map(resume?(record.layers||[]).map(element=>[element,pose(element)]):[]);
    if(resume){record.token++;record.closing=false;stopWithin(dialog);}
    else{
      const row=source?.closest?.('.card,.quicklook-tile,.catalog-table tr[data-open]');
      record={source:source?.matches?.('.card')?source.querySelector('.card-main'):source,row,rowId:row?key(row):null,token:0,closing:false};dialogs.set(dialog,record);
    }
    dialog.classList.add('motion-managed');dialog.classList.remove('is-closing');record.row?.classList.add('source-active');
    if(!watchedDialogs.has(dialog)){
      watchedDialogs.add(dialog);
      dialog.addEventListener('close',()=>{
        if(dialog.open)return;
        const current=dialogs.get(dialog);
        if(current){current.token++;current.closing=false;current.row?.classList.remove('source-active');}
        stopWithin(dialog);dialog.classList.remove('is-closing');
      });
    }
    if(!dialog.open)dialog.showModal();
    const drawer=dialog.classList.contains('drawer'),horizontal=drawer&&innerWidth>700;
    play(dialog,[from||{opacity:.2,transform:horizontal?'translateX(32px)':'translateY(18px)'},{opacity:1,transform:'translate(0,0)'}],{duration:resume?260:350});
    record.layers=dialogLayers(dialog);
    record.layers.forEach((element,index)=>play(element,[
      resume?(layerPoses.get(element)||pose(element)):{opacity:0,transform:'translateY(8px)'},
      {opacity:1,transform:'translateY(0)'}
    ],{duration:300,delay:resume?0:55+Math.min(index*32,145)}));
  }
  function close(dialog,value='cancel'){
    if(!dialog?.open)return Promise.resolve();
    let record=dialogs.get(dialog);
    if(record?.closing)return record.promise;
    if(!record){record={token:0};dialogs.set(dialog,record);}
    const token=++record.token,from=pose(dialog);
    record.closing=true;dialog.classList.add('is-closing');
    for(const element of record.layers||[])play(element,[pose(element),{opacity:0,transform:'translateY(3px)',offset:.65},{opacity:0,transform:'translateY(3px)'}],{duration:240,easing:leave});
    record.promise=play(dialog,[from,{opacity:0,transform:dialog.classList.contains('drawer')&&innerWidth>700?'translateX(22px)':'translateY(12px)'}],{duration:210,easing:leave}).then(()=>{
      if(record.token!==token||!record.closing)return;
      dialog.close(value);dialog.classList.remove('is-closing');record.row?.classList.remove('source-active');record.closing=false;
      requestAnimationFrame(()=>{
        if(dialog.open)return;
        const current=record.source?.isConnected?record.source:record.rowId?[...document.querySelectorAll('.card-main[data-open],.quicklook-tile[data-open],.catalog-table tr[data-open]')].find(el=>el.dataset.open===record.rowId):null;
        const remaining=query('dialog[open]');
        if(!remaining||remaining.contains(current))current?.focus?.({preventScroll:true});
      });
    });
    return record.promise;
  }
  function swap(root,back=false){return reveal(root,{direction:back?-1:1,distance:8,duration:290});}
  function favorite(id){
    document.querySelectorAll('[data-favorite]').forEach(element=>{
      if(element.dataset.favorite!==id)return;
      const selected=element.getAttribute('aria-pressed')==='true'||element.classList.contains('active')||element.textContent.includes('已收藏');
      play(element.querySelector('svg'),selected?[
        {transform:'scale(.82)',opacity:.6},
        {transform:'scale(1.2)',opacity:1,offset:.5},
        {transform:'scale(1)',opacity:1}
      ]:[{transform:'scale(1)',opacity:1},{transform:'scale(.78)',opacity:.35,offset:.45},{transform:'scale(1)',opacity:1}],{duration:selected?340:240});
    });
  }
  const navRoot=query('.workspace-nav');
  if(navRoot)new ResizeObserver(nav).observe(navRoot);
  // The opening sequence runs once. Subsequent quotes retain their reading position.
  const startupTime=performance.now();
  requestAnimationFrame(()=>{
    nav();
    if(reduced())return;
    navRoot?.querySelectorAll('[data-page]').forEach((element,index)=>play(element,[{opacity:0},{opacity:1}],{duration:320,delay:index*30}));
    reveal(query('.page-heading'),{distance:8,delay:100,duration:380});
    reveal(query('.context-toolbar'),{distance:6,delay:145,duration:350});
  });
  const revealReady=()=>reveal(query('#monitor-panel'),{distance:10,delay:Math.max(60,200-(performance.now()-startupTime)),duration:420});
  if(document.body.dataset.loading==='true'){
    const readyObserver=new MutationObserver(()=>{
      if(document.body.dataset.loading==='true')return;
      readyObserver.disconnect();revealReady();
    });
    readyObserver.observe(document.body,{attributes:true,attributeFilter:['data-loading']});
  }else revealReady();
  return {open,close,swap,capture,reflow,changePage,nav,favorite,play,syncMotion,reduced};
}
