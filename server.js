import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import {openPostgres} from './postgres.js';

const root = dirname(fileURLToPath(import.meta.url));
export async function createApp({ dbPath = process.env.DB_PATH || resolve(root, 'data/campus.db'), databaseUrl = process.env.DATABASE_URL, postgresPool, adminToken = process.env.ADMIN_TOKEN || '', rateLimit = 30 } = {}) {
  const pgStore=databaseUrl || postgresPool ? await openPostgres(databaseUrl,postgresPool) : null;
  if (!pgStore && dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = pgStore ? null : new DatabaseSync(dbPath);
  if(db){db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
      description TEXT NOT NULL, starts_at TEXT NOT NULL, venue TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity > 0), art TEXT NOT NULL, symbol TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id),
      name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80),
      email TEXT NOT NULL COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(event_id,email)
    );
    CREATE INDEX IF NOT EXISTS registrations_event_idx ON registrations(event_id);`);
  const seed = db.prepare('INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,?,?,?)');
  seed.run(1,'Web Development Workshop','Workshop','Build your first responsive webpage with HTML, CSS and JavaScript.','2026-09-20T10:00:00+05:30','Computer Lab',60,'','</>');
  seed.run(2,'Coding Challenge','Competition','Solve problems, test your logic and practise with fellow students.','2026-09-22T11:00:00+05:30','Innovation Hub',40,'green','{ }');
  seed.run(3,'Tech Talk','Talk','Explore how modern websites connect users, services and data.','2026-09-24T14:00:00+05:30','Seminar Hall',100,'purple','WEB');
  }
  const attempts = new Map();
  const assets = new Map([['/','index.html'],['/admin','admin.html'],['/app.js','app.js'],['/admin.js','admin.js'],['/styles.css','styles.css'],['/favicon.svg','favicon.svg']].map(([url,file]) => [url,{body:readFileSync(resolve(root,'public',file)), type:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html'}]));
  const json = (res,status,data) => {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  function authorized(req) {
    const token = (req.headers.authorization || '').replace(/^Bearer /,'');
    return adminToken.length >= 24 && Buffer.byteLength(token) === Buffer.byteLength(adminToken) && timingSafeEqual(Buffer.from(token),Buffer.from(adminToken));
  }
  const server = http.createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url = new URL(req.url,'http://localhost');
      if(req.method === 'GET' && assets.has(url.pathname)) { const asset=assets.get(url.pathname); res.writeHead(200,{'Content-Type':asset.type+'; charset=utf-8'}); return res.end(asset.body); }
      if(req.method === 'GET' && url.pathname === '/api/health') { if(pgStore)await pgStore.health();else db.prepare('SELECT 1').get(); return json(res,200,{status:'ok',database:'connected',storage:pgStore?'PostgreSQL':'SQLite'}); }
      if(req.method === 'GET' && url.pathname === '/api/events') {
        const events=pgStore?await pgStore.events():db.prepare(`SELECT e.*, (SELECT count(*) FROM registrations r WHERE r.event_id=e.id) AS registered FROM events e ORDER BY starts_at`).all();
        return json(res,200,{storage:pgStore?'PostgreSQL':'SQLite',events:events.map(e=>({...e,remaining:e.capacity-e.registered}))});
      }
      if(req.method === 'GET' && url.pathname === '/api/admin/registrations') {
        if(!authorized(req)) return json(res,401,{error:'Administrator access required.'});
        return json(res,200,{registrations:pgStore?await pgStore.registrations():db.prepare('SELECT r.id,r.name,r.email,r.created_at,e.title AS event FROM registrations r JOIN events e ON e.id=r.event_id ORDER BY r.created_at DESC').all()});
      }
      if(req.method === 'POST' && url.pathname === '/api/registrations') {
        if(!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(res,415,{error:'Send JSON data.'});
        // No cross-origin browser writes. Host/proxy setup must preserve the public Host.
        if(req.headers.origin) { let origin; try{origin=new URL(req.headers.origin);}catch{return json(res,403,{error:'Invalid origin.'});} if(origin.host!==req.headers.host) return json(res,403,{error:'Cross-origin requests are not allowed.'}); }
        const now=Date.now(), ip=req.socket.remoteAddress || 'unknown';
        for(const [key,value] of attempts) if(now-value.start>60000) attempts.delete(key);
        const bucket=attempts.get(ip) || {start:now,count:0}; bucket.count++; attempts.set(ip,bucket);
        if(bucket.count>rateLimit) {res.setHeader('Retry-After','60'); return json(res,429,{error:'Too many attempts. Please wait one minute.'});}
        let body='', size=0;
        for await (const chunk of req) {size+=chunk.length; if(size>4096) {json(res,413,{error:'Request is too large.'}); return;} body+=chunk;}
        let input; try{input=JSON.parse(body);}catch{return json(res,400,{error:'Invalid JSON.'});}
        if(!input || typeof input !== 'object') return json(res,400,{error:'Invalid registration.'});
        const name=typeof input.name==='string'?input.name.trim():'', email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
        if(name.length<2 || name.length>80 || /[\x00-\x1f\x7f]/.test(name)) return json(res,400,{error:'Enter a name between 2 and 80 characters.'});
        if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res,400,{error:'Enter a valid email address.'});
        if(!Number.isInteger(input.eventId)) return json(res,400,{error:'Choose a valid event.'});
        const event=pgStore?await pgStore.event(input.eventId):db.prepare('SELECT * FROM events WHERE id=?').get(input.eventId);
        if(!event) return json(res,404,{error:'Event not found.'});
        if(Date.parse(event.starts_at)<=Date.now()) return json(res,409,{error:'Registration for this event has closed.'});
        if(pgStore){const {status,...result}=await pgStore.register(event,name,email);return json(res,status,result);}
        db.exec('BEGIN IMMEDIATE');
        try {
          if(db.prepare('SELECT id FROM registrations WHERE event_id=? AND email=?').get(event.id,email)) {db.exec('ROLLBACK');return json(res,409,{error:'This email is already registered for this event.'});}
          if(db.prepare('SELECT count(*) AS total FROM registrations WHERE event_id=?').get(event.id).total>=event.capacity) {db.exec('ROLLBACK');return json(res,409,{error:'This event is full.'});}
          const id=randomUUID();
          db.prepare('INSERT INTO registrations(id,event_id,name,email) VALUES (?,?,?,?)').run(id,event.id,name,email);
          db.exec('COMMIT');
          return json(res,201,{registration:{id,name,email,event:event.title},message:'Registration saved to the database.'});
        }catch(error){db.exec('ROLLBACK');throw error;}
      }
      return json(res,404,{error:'Not found.'});
    }catch(error){console.error('Request failed:',error.message);if(!res.headersSent)json(res,500,{error:'Unable to complete the request. Please try again.'});else res.end();}
  });
  server.on('close',()=>{if(pgStore)pgStore.close().catch(error=>console.error('Database shutdown failed:',error.message));else db.close();});
  server.requestTimeout=15000;
  return {server,db,pgStore};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {server}=await createApp();
  const port=Number(process.env.PORT || 3000);
  server.listen(port,process.env.HOST || '127.0.0.1',()=>console.log(`Campus Event Portal running on port ${port}`));
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));
}
