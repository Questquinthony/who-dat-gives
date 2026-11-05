const {randomBytes,timingSafeEqual}=require('crypto');
const {db,entriesEnabled}=require('../../lib/db');
function secureEq(a,b){
  const aBuf=Buffer.from(String(a||'')), bBuf=Buffer.from(String(b||''));
  return aBuf.length===bBuf.length && timingSafeEqual(aBuf,bBuf);
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  const provided=String(req.headers.authorization||'').replace(/^Bearer /i,'');
  if(!process.env.ADMIN_CONFIRM_KEY||!secureEq(provided,process.env.ADMIN_CONFIRM_KEY))return res.status(401).json({error:'Unauthorized'});
  if(!entriesEnabled()||!process.env.DATABASE_URL)return res.status(503).json({error:'Ticket confirmation not enabled'});
  const id=String(req.body?.orderId||'');
  const paymentRef=String(req.body?.paymentReference||'').trim();
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)||paymentRef.length<4||paymentRef.length>150)return res.status(400).json({error:'Invalid order or payment reference'});
  // IMPORTANT: This endpoint assumes the organizer has independently verified payment.
  // It never contacts Zelle, a bank, or a payment processor.
  const client=await db().connect();
  try{
    await client.query('BEGIN');
    const q=await client.query('SELECT id,quantity,status,payment_reference FROM raffle_orders WHERE id=$1 FOR UPDATE',[id]);
    if(!q.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Order not found'});}
    const order=q.rows[0];
    if(order.status==='confirmed'){
      await client.query('ROLLBACK');return res.status(409).json({error:'Order already confirmed; tickets will not be duplicated.'});
    }
    if(order.status!=='pending_payment'){await client.query('ROLLBACK');return res.status(409).json({error:'Order is not pending payment.'});}
    await client.query("UPDATE raffle_orders SET status='confirmed',payment_reference=$2,confirmed_at=NOW() WHERE id=$1",[id,paymentRef]);
    const tickets=[];
    for(let i=0;i<order.quantity;i++){
      const code=randomBytes(24).toString('hex');
      const t=await client.query('INSERT INTO raffle_tickets(order_id,verification_code) VALUES($1,$2) RETURNING number',[id,code]);
      tickets.push({number:Number(t.rows[0].number),verificationCode:code});
    }
    await client.query('COMMIT');
    return res.status(200).json({orderId:id,status:'confirmed',tickets});
  }catch(e){
    try{await client.query('ROLLBACK')}catch(_){}
    console.error('Confirmation error',e.code||'unknown');
    return res.status(e.code==='23505'?409:500).json({error:e.code==='23505'?'Payment reference already used.':'Ticket confirmation failed.'});
  }finally{client.release();}
};
