const {randomBytes}=require('crypto');
const {db,entriesEnabled}=require('../../lib/db');
const authorized=require('../../lib/admin-auth');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!entriesEnabled()||!process.env.DATABASE_URL)return res.status(503).json({error:'Ticket confirmation not enabled'});
  const id=String(req.body?.orderId||'');
  const paymentRef=String(req.body?.paymentReference||'').trim();
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)||paymentRef.length<4||paymentRef.length>150)return res.status(400).json({error:'Invalid order or payment reference'});
  // The organizer must verify payment directly with their provider first.
  // This endpoint cannot independently verify bank/Zelle transactions.
  const client=await db().connect();
  try{
    await client.query('BEGIN');
    const q=await client.query('SELECT id,quantity,status FROM raffle_orders WHERE id=$1 FOR UPDATE',[id]);
    if(!q.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Order not found'});}
    const order=q.rows[0];
    if(order.status==='confirmed'){await client.query('ROLLBACK');return res.status(409).json({error:'Order already confirmed'});}
    if(order.status!=='pending_payment'){await client.query('ROLLBACK');return res.status(409).json({error:'Order not pending'});}
    await client.query("UPDATE raffle_orders SET status='confirmed',payment_reference=$2,confirmed_at=NOW() WHERE id=$1",[id,paymentRef]);
    const tickets=[];
    for(let i=0;i<order.quantity;i++){
      const code=randomBytes(24).toString('hex');
      const t=await client.query('INSERT INTO raffle_tickets(order_id,verification_code) VALUES($1,$2) RETURNING number',[id,code]);
      tickets.push({number:Number(t.rows[0].number),verificationCode:code});
    }
    await client.query("INSERT INTO raffle_audit_events(order_id,event_type,detail) VALUES($1,'order_confirmed',jsonb_build_object('quantity',$2::integer))",[id,order.quantity]);
    await client.query('COMMIT');
    return res.status(200).json({orderId:id,status:'confirmed',tickets});
  }catch(e){
    try{await client.query('ROLLBACK')}catch(_){}
    console.error('Admin confirm error',e.code||'unknown');
    return res.status(e.code==='23505'?409:500).json({error:e.code==='23505'?'Payment reference already used':'Ticket confirmation failed'});
  }finally{client.release();}
};
