const {db,entriesEnabled}=require('../../lib/db');
const authorized=require('../../lib/admin-auth');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!process.env.DATABASE_URL)return res.status(503).json({error:'Database not configured'});
  try{
    const [stats,events]=await Promise.all([
      db().query(`
        SELECT COUNT(*)::int AS orders,
          COUNT(*) FILTER(WHERE status='pending_payment')::int AS pending_orders,
          COUNT(*) FILTER(WHERE status='confirmed')::int AS confirmed_orders,
          COALESCE(SUM(amount_cents) FILTER(WHERE status='confirmed'),0)::bigint AS confirmed_cents
        FROM raffle_orders`),
      db().query(`
        SELECT id,event_type,order_id,created_at FROM raffle_audit_events
        ORDER BY created_at DESC LIMIT 20`)
    ]);
    const tickets=await db().query('SELECT COUNT(*)::int AS issued_tickets FROM raffle_tickets');
    return res.status(200).json({
      stats:{...stats.rows[0],...tickets.rows[0]},
      recentEvents:events.rows,
      salesEnabled:entriesEnabled(),
      emailConfigured:Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM&&process.env.SITE_URL),
      source:'who-dat-gives'
    });
  }catch(e){console.error('Admin summary error',e.code||'unknown');return res.status(500).json({error:'Unable to load summary'});}
};
