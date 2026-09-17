import {randomUUID} from 'node:crypto';
export async function openPostgres(connectionString, suppliedPool) {
  const pool=suppliedPool || new (await import('pg')).default.Pool({connectionString,max:5,connectionTimeoutMillis:10000});
  await pool.query(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,
    starts_at TEXT NOT NULL,venue TEXT NOT NULL,capacity INTEGER NOT NULL CHECK(capacity>0),art TEXT NOT NULL,symbol TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS registrations (
    id TEXT PRIMARY KEY,event_id INTEGER NOT NULL REFERENCES events(id),
    name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80),email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE UNIQUE INDEX IF NOT EXISTS registration_event_email ON registrations(event_id,lower(email));
    CREATE INDEX IF NOT EXISTS registration_event_idx ON registrations(event_id);`);
  const rows=[
    [1,'Web Development Workshop','Workshop','Build your first responsive webpage with HTML, CSS and JavaScript.','2026-09-20T10:00:00+05:30','Computer Lab',60,'','</>'],
    [2,'Coding Challenge','Competition','Solve problems, test your logic and practise with fellow students.','2026-09-22T11:00:00+05:30','Innovation Hub',40,'green','{ }'],
    [3,'Tech Talk','Talk','Explore how modern websites connect users, services and data.','2026-09-24T14:00:00+05:30','Seminar Hall',100,'purple','WEB']
  ];
  for(const row of rows)await pool.query('INSERT INTO events VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING',row);
  return {
    pool, health:()=>pool.query('SELECT 1'),
    events:async()=>(await pool.query('SELECT e.*, (SELECT count(*)::int FROM registrations r WHERE r.event_id=e.id) AS registered FROM events e ORDER BY starts_at')).rows,
    event:async id=>(await pool.query('SELECT * FROM events WHERE id=$1',[id])).rows[0],
    registrations:async()=>(await pool.query('SELECT r.id,r.name,r.email,r.created_at,e.title AS event FROM registrations r JOIN events e ON e.id=r.event_id ORDER BY r.created_at DESC')).rows,
    register:async(event,name,email)=>{
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        // Row lock serialises capacity checks for this event across server instances.
        const locked=(await client.query('SELECT * FROM events WHERE id=$1 FOR UPDATE',[event.id])).rows[0];
        if(!locked){await client.query('ROLLBACK');return {status:404,error:'Event not found.'};}
        if(Date.parse(locked.starts_at)<=Date.now()){await client.query('ROLLBACK');return {status:409,error:'Registration for this event has closed.'};}
        if((await client.query('SELECT id FROM registrations WHERE event_id=$1 AND lower(email)=lower($2)',[event.id,email])).rows.length){await client.query('ROLLBACK');return {status:409,error:'This email is already registered for this event.'};}
        const count=(await client.query('SELECT count(*)::int AS total FROM registrations WHERE event_id=$1',[event.id])).rows[0].total;
        if(count>=locked.capacity){await client.query('ROLLBACK');return {status:409,error:'This event is full.'};}
        const id=randomUUID();
        await client.query('INSERT INTO registrations(id,event_id,name,email) VALUES ($1,$2,$3,$4)',[id,event.id,name,email]);
        await client.query('COMMIT');
        return {status:201,registration:{id,name,email,event:event.title},message:'Registration saved to the database.'};
      }catch(error){await client.query('ROLLBACK');if(error.code==='23505')return {status:409,error:'This email is already registered for this event.'};throw error;}
      finally{client.release();}
    },close:()=>pool.end()
  };
}
