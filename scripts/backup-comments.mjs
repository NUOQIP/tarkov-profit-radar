import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {rename,chmod} from 'node:fs/promises';
const [source,target]=process.argv.slice(2);
if(!source||!target)throw new Error('Supply the comments database and backup target');
if(existsSync(source)){
  const db=new DatabaseSync(source,{readOnly:true});
  try{await backup(db,target+'.partial');await chmod(target+'.partial',0o600);await rename(target+'.partial',target);}finally{db.close();}
}
