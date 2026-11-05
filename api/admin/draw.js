const {randomInt}=require('crypto');
const {db,entriesEnabled}=require('../../lib/db');
const authorized=require('../../lib/admin-auth');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
 if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
 if(!process.env.DATABASE_URL||!entriesEnabled()||process.env.DRAW_ENABLED!=='true')return res.status(503).json({error:'Official drawing not enabled. Rehearsal remains available.'});
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(2026111501)');
  const previous=await client.query('SELECT winner_ticket,drawn_at FROM raffle_draws WHERE id=1');
  if(previous.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'Official winner has already been selected. The result cannot be overwritten.'});}
  const q=await client.query("SELECT t.number FROM raffle_tickets t JOIN raffle_orders o ON o.id=t.order_id WHERE o.status='confirmed' ORDER BY t.number FOR SHARE OF t,o");
  if(!q.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'No confirmed tickets available for drawing'});}
  const winner=Number(q.rows[randomInt(q.rowCount)].number);
  await client.query("INSERT INTO raffle_draws(id,winner_ticket,pool_size) VALUES(1,$1,$2)",[winner,q.rowCount]);
  await client.query("INSERT INTO raffle_audit_events(event_type,detail) VALUES('official_draw',jsonb_build_object('winner_ticket',$1::bigint,'pool_size',$2::integer,'method','node_crypto_randomInt'))",[winner,q.rowCount]);
  await client.query('COMMIT');
  return res.status(200).json({winnerNumber:winner,count:q.rowCount,recorded:true});
 }catch(e){
  try{await client.query('ROLLBACK')}catch(_){}
  console.error('Official drawing failed',e.code||'unknown');
  return res.status(500).json({error:'Drawing failed; check organizer records before retrying'});
 }finally{client.release();}
};
