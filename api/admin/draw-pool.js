const {db,entriesEnabled}=require('../../lib/db');
const authorized=require('../../lib/admin-auth');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
 if(!process.env.DATABASE_URL)return res.status(503).json({error:'Database not configured'});
 try{
  const existing=await db().query('SELECT winner_ticket,pool_size,drawn_at FROM raffle_draws WHERE id=1');
  if(existing.rowCount)return res.status(200).json({drawn:true,winnerNumber:Number(existing.rows[0].winner_ticket),count:existing.rows[0].pool_size,drawnAt:existing.rows[0].drawn_at,available:false});
  if(!entriesEnabled()||process.env.DRAW_ENABLED!=='true')return res.status(200).json({available:false,drawn:false,count:0,reason:'Official drawing disabled; use rehearsal mode'});
  const q=await db().query("SELECT t.number FROM raffle_tickets t JOIN raffle_orders o ON o.id=t.order_id WHERE o.status='confirmed' ORDER BY t.number");
  return res.status(200).json({available:q.rowCount>0,drawn:false,count:q.rowCount,numbers:q.rows.map(x=>Number(x.number))});
 }catch(e){console.error('Draw pool error',e.code||'unknown');return res.status(500).json({error:'Unable to load drawing records'});}
};
