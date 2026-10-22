const filename=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,160}\.(?:webp|png|jpe?g)$/;
export function mediaUrl(value){
  try{
    const url=new URL(value);
    if(url.origin!=='https://assets.tarkov.dev'||url.search||url.hash||url.username||url.password)return '';
    const name=url.pathname.slice(1);
    return filename.test(name)?'/media/v1/'+name:'';
  }catch{return '';}
}
export function preserveImages(previous,next){
  const pictures=new Map();
  for(const img of previous.querySelectorAll('img')){
    const key=img.dataset.imageKey||img.getAttribute('src');
    if(!pictures.has(key))pictures.set(key,[]);
    pictures.get(key).push(img);
  }
  for(const img of next.querySelectorAll('img')){
    const key=img.dataset.imageKey||img.getAttribute('src'),old=pictures.get(key)?.shift();
    if(!old)continue;
    for(const name of ['class','alt','loading','decoding']){
      if(img.hasAttribute(name))old.setAttribute(name,img.getAttribute(name));
    }
    img.replaceWith(old);
  }
}
export function updateCardList(root,markup){
  const template=document.createElement('template');template.innerHTML=markup;
  const prior=new Map([...root.children].filter(e=>e.dataset.row).map(e=>[e.dataset.row,e]));
  const children=[...template.content.children].map(next=>{
    const old=prior.get(next.dataset.row);
    if(!old){next.dataset.markup=next.outerHTML;return next;}
    if(old.dataset.markup===next.outerHTML)return old;
    const raw=next.outerHTML;
    preserveImages(old,next);
    for(const {name} of [...old.attributes])if(!next.hasAttribute(name)&&name!=='data-markup')old.removeAttribute(name);
    for(const {name,value} of next.attributes)old.setAttribute(name,value);
    old.replaceChildren(...next.childNodes);old.dataset.markup=raw;
    return old;
  });
  reconcileChildren(root,children);
}
export function reconcileChildren(root,children){
  const keep=new Set(children);
  children.forEach((child,index)=>{if(root.children[index]!==child)root.insertBefore(child,root.children[index]||null);});
  for(const child of [...root.children])if(!keep.has(child))child.remove();
}
