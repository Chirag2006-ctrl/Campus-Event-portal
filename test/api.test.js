import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.js';

const key='test-access-key-32-characters-long';
async function fixture(options={}) {
  const app=createApp({dbPath:':memory:',adminToken:key,...options});
  app.db.prepare("UPDATE events SET starts_at='2099-09-20T10:00:00+05:30'").run();
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const base='http://127.0.0.1:'+app.server.address().port;
  const request=(path,options)=>fetch(base+path,options);
  const post=(data,headers={})=>request('/api/registrations',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
  return {...app,base,request,post,close:()=>new Promise(resolve=>app.server.close(resolve))};
}
const valid={name:'Demo Student',email:'demo@example.com',eventId:1};
test('events come from the database and the homepage loads',async()=>{const a=await fixture();try{assert.equal((await (await a.request('/api/events')).json()).events.length,3);assert.equal((await a.request('/')).status,200);assert.equal((await (await a.request('/api/health')).json()).database,'connected');}finally{await a.close();}});
test('valid registration is saved and only administrators can read details',async()=>{const a=await fixture();try{const r=await a.post(valid);assert.equal(r.status,201);assert.equal((await r.json()).registration.email,valid.email);assert.equal((await a.request('/api/admin/registrations')).status,401);assert.equal((await a.request('/api/admin/registrations',{headers:{Authorization:'Bearer wrong'}})).status,401);const rows=await (await a.request('/api/admin/registrations',{headers:{Authorization:'Bearer '+key}})).json();assert.equal(rows.registrations[0].name,valid.name);assert.equal((await (await a.request('/api/events')).json()).events[0].remaining,59);}finally{await a.close();}});
test('duplicates are rejected regardless of email case; another event is allowed',async()=>{const a=await fixture();try{await a.post(valid);assert.equal((await a.post({...valid,email:'DEMO@example.com'})).status,409);assert.equal((await a.post({...valid,eventId:2})).status,201);}finally{await a.close();}});
test('server rejects invalid fields, unknown events, malformed JSON and cross-origin writes',async()=>{const a=await fixture();try{for(const data of [null,{}, {...valid,name:''},{...valid,email:'bad'},{...valid,eventId:'1'},{...valid,name:'x'.repeat(81)}])assert.equal((await a.post(data)).status,400);assert.equal((await a.post({...valid,eventId:999})).status,404);assert.equal((await a.post(valid,{Origin:'https://another.example'})).status,403);assert.equal((await a.request('/api/registrations',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);assert.equal((await a.request('/api/registrations',{method:'POST',body:'hello'})).status,415);}finally{await a.close();}});
test('capacity and closing date are enforced on the server',async()=>{const a=await fixture();try{a.db.prepare('UPDATE events SET capacity=1 WHERE id=1').run();assert.equal((await a.post(valid)).status,201);assert.equal((await a.post({...valid,email:'second@example.com'})).status,409);a.db.prepare("UPDATE events SET starts_at='2000-01-01T10:00:00Z' WHERE id=2").run();assert.equal((await a.post({...valid,eventId:2})).status,409);}finally{await a.close();}});
test('rate limits and request size limits are enforced',async()=>{const a=await fixture({rateLimit:2});try{assert.equal((await a.post({...valid,name:'x'.repeat(5000)})).status,413);await a.post(valid);assert.equal((await a.post(valid)).status,429);}finally{await a.close();}});
test('SQL text is stored as data and security headers protect the UI',async()=>{const a=await fixture();try{assert.equal((await a.post({...valid,name:"Robert'); DROP TABLE events;--"})).status,201);assert.equal(a.db.prepare('SELECT count(*) AS n FROM events').get().n,3);const r=await a.request('/');assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);assert.equal((await a.request('/.env')).status,404);}finally{await a.close();}});
test('registrations persist across a complete server restart',async()=>{const dir=mkdtempSync(join(tmpdir(),'campus-test-')),dbPath=join(dir,'campus.db');let a=await fixture({dbPath});try{await a.post(valid);await a.close();a=await fixture({dbPath});const result=await (await a.request('/api/admin/registrations',{headers:{Authorization:'Bearer '+key}})).json();assert.equal(result.registrations.length,1);assert.equal(result.registrations[0].email,valid.email);}finally{await a.close();rmSync(dir,{recursive:true,force:true});}});
