const copy=value=>value==null?null:JSON.parse(JSON.stringify(value));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// A revision accompanies every write. Conflicts are resolved by the player, never by time.
export function createPreferenceSync({save,apply,cache=()=>{},status=()=>{}}){
  let draft=null,base=null,revision=0,conflict=null,flight=null,generation=0,phase='idle';
  const dirty=()=>!equal(draft,base);
  function publish(next){
    phase=next;cache({settings:copy(draft),revision,dirty:dirty()});status({phase,dirty:dirty(),conflict:copy(conflict)});
  }
  function adopt(value){draft=copy(value);apply(copy(value));}
  function bind(remote,local){
    generation++;flight=null;revision=remote.revision;base=copy(remote.settings);conflict=null;
    if(local?.dirty&&local.settings&&!equal(local.settings,base)){
      adopt(local.settings);if(local.revision!==revision)conflict=copy(remote);
    }else adopt(base);
    publish(conflict?'conflict':dirty()?'pending':base?'saved':'empty');
  }
  function update(settings){
    if(equal(settings,draft))return;draft=copy(settings);publish(conflict?'conflict':dirty()?'pending':'saved');
  }
  function remote(value){
    if(value.revision===revision)return;
    if(!dirty()||equal(draft,value.settings)){revision=value.revision;base=copy(value.settings);conflict=null;adopt(value.settings);publish('saved');}
    else{conflict=copy(value);publish('conflict');}
  }
  async function flush(){
    if(flight)return flight;
    if(conflict||!dirty()||!draft)return false;
    const stamp=generation,sent=copy(draft),version=revision;
    publish('saving');
    const run=(async()=>{
      try{
        const result=await save(sent,version);
        if(stamp!==generation)return false;
        revision=result.revision;base=copy(result.settings);
        if(equal(draft,sent))draft=copy(result.settings);
        publish(dirty()?'pending':'saved');return true;
      }catch(error){
        if(stamp!==generation)return false;
        if(error.status===409&&error.current){
          if(equal(error.current.settings,sent)){revision=error.current.revision;base=copy(error.current.settings);publish(dirty()?'pending':'saved');return true;}
          conflict=copy(error.current);publish('conflict');
        }else publish(error.status===401?'expired':'offline');
        return false;
      }finally{if(stamp===generation)flight=null;}
    })();
    flight=run;return run;
  }
  function resolve(useLocal){
    if(!conflict)return;
    revision=conflict.revision;base=copy(conflict.settings);conflict=null;
    if(!useLocal)adopt(base);publish(dirty()?'pending':'saved');
  }
  function stop(){generation++;flight=null;draft=null;base=null;conflict=null;revision=0;phase='idle';}
  return {bind,update,remote,flush,resolve,stop,get state(){return {phase,dirty:dirty(),revision,settings:copy(draft),conflict:copy(conflict)};}};
}
