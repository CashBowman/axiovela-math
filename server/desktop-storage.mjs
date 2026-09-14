import {randomUUID} from 'node:crypto';
import {useProviderStorage} from './axiovela/provider-settings.mjs';
if(process.env.AXIOVELA_MATH_SECURE_STORAGE==='1'){
 const pending=new Map();
 process.on('message',m=>{if(m?.type!=='provider-storage-result')return;const p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);if(m.error)p.reject(Error(m.error));else p.resolve(m.value);});
 const call=(action,value)=>new Promise((resolve,reject)=>{if(!process.send)return reject(Error('Desktop private storage is unavailable.'));const id=randomUUID();const timer=setTimeout(()=>{pending.delete(id);reject(Error('Private storage request timed out.'));},10000);pending.set(id,{resolve,reject,timer});process.send({type:'provider-storage',id,action,value});});
 useProviderStorage({read:()=>call('read'),write:value=>call('write',value)});
}
