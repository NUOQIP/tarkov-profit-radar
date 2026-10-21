import { mkdir,writeFile,rename } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { passwordCredential } from '../app/admin-auth.mjs';

// Read the new password from stdin; never put it in shell arguments or source.
const destination=resolve(process.argv[2]||'.cache/v2/admin/credentials.json');
let password='';
for await(const chunk of process.stdin){password+=chunk;if(Buffer.byteLength(password)>512)throw new Error('Password input too long');}
password=password.replace(/\r?\n$/,'');
const credential=await passwordCredential(password);
await mkdir(dirname(destination),{recursive:true,mode:0o700});
const temporary=destination+'.'+crypto.randomUUID()+'.tmp';
await writeFile(temporary,JSON.stringify(credential),{mode:0o600});
await rename(temporary,destination);
console.log('Administrator password saved. Existing sessions will expire.');
