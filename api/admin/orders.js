const {db}=require('../../lib/db');
const authorized=require('../../lib/admin-auth');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!process.env.DATABASE_URL)return res.status(503).json({error:'Database not configured'});
  try{
    const r=await db().query(
      `SELECT o.id,o.buyer_name,o.phone,o.email,o.quantity,o.amount_cents,
              o.status,o.created_at,o.confirmed_at,o.payment_reference,
              COALESCE(d.status,'not_sent') AS email_status,
              COALESCE(json_agg(json_build_object('number',t.number,'verificationCode',t.verification_code)
              ORDER BY t.number) FILTER(WHERE t.number IS NOT NULL),'[]'::json) AS tickets
         FROM raffle_orders o
         LEFT JOIN raffle_tickets t ON t.order_id=o.id
         LEFT JOIN raffle_email_deliveries d ON d.order_id=o.id
        GROUP BY o.id,d.status ORDER BY o.created_at DESC LIMIT 100`
    );
    return res.status(200).json({orders:r.rows});
  }catch(e){console.error('Admin orders error',e.code||'unknown');return res.status(500).json({error:'Unable to load orders'});}
};
