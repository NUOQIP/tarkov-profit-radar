import { readFile,writeFile,mkdir,rename } from 'node:fs/promises';
import { dirname,join } from 'node:path';

export function localStore(directory) {
  const queues=new Map();
  const store={
    namespace:directory,
    async read(key){try{return JSON.parse(await readFile(join(directory,key),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}},
    async write(key,value){
      const path=join(directory,key);await mkdir(dirname(path),{recursive:true});
      const temp=path+'.'+crypto.randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value));await rename(temp,path);
    },
    async update(key,change){
      const previous=queues.get(key)||Promise.resolve();
      const next=previous.catch(()=>{}).then(async()=>{const value=change(await store.read(key));if(value!==null)await store.write(key,value);});
      queues.set(key,next);try{await next;}finally{if(queues.get(key)===next)queues.delete(key);}
    }
  };
  return store;
}
