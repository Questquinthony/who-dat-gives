const {db,entriesEnabled}=require('../../lib/db');
const authorized=require('../../lib/admin-auth');
const {configured:organizerEmailReady,recipients,sendTestNotification}=require('../../lib/order-mail');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'&&req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!process.env.DATABASE_URL)return res.status(503).json({error:'Database not configured'});
  if(req.method==='POST'){
   if(req.body?.action!=='test_email')return res.status(400).json({error:'Unrecognized organizer action'});
   if(!organizerEmailReady())return res.status(503).json({error:'Gmail sender authorization is not configured'});
   try{
    const result=await sendTestNotification();
    return res.status(result.sent===result.intended?200:502).json({
     sent:result.sent,intended:result.intended,
     message:result.sent===result.intended?'Test notification sent to both organizer inboxes.':'Some test messages could not be sent. Check Gmail credentials and mail logs.'
    });
   }catch(e){console.error('Email test error',e.code||'unknown');return res.status(502).json({error:'Unable to send test notification'})}
  }
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
    const tickets=await db().query("SELECT COUNT(*) FILTER(WHERE o.status='confirmed')::int AS issued_tickets, COUNT(*) FILTER(WHERE o.status='pending_payment')::int AS reserved_tickets FROM raffle_tickets t JOIN raffle_orders o ON o.id=t.order_id");
    return res.status(200).json({
      stats:{...stats.rows[0],...tickets.rows[0]},
      recentEvents:events.rows,
      salesEnabled:entriesEnabled(),
      emailConfigured:Boolean(process.env.GMAIL_SMTP_USER&&process.env.GMAIL_SMTP_APP_PASSWORD&&process.env.SITE_URL),
      organizerNotificationsReady:organizerEmailReady(),
      organizerRecipientCount:recipients().length,
      gmailSenderConfigured:Boolean(process.env.GMAIL_SMTP_USER),
      source:'who-dat-gives'
    });
  }catch(e){console.error('Admin summary error',e.code||'unknown');return res.status(500).json({error:'Unable to load summary'});}
};
