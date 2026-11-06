const {db,entriesEnabled}=require('../../lib/db');
const authorized=require('../../lib/admin-auth');
const {notifyOrganizers,notifyCustomer}=require('../../lib/order-mail');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'})}
 if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
 if(!entriesEnabled()||!process.env.DATABASE_URL)return res.status(503).json({error:'Ticket confirmation not enabled'});
 const id=String(req.body?.orderId||''),paymentRef=String(req.body?.paymentReference||'').trim();
 const confirmedAmount=Number(req.body?.bankAmountCents);
 const observedMemo=String(req.body?.bankMemo||'').trim().toUpperCase();
 const bankDepositObserved=req.body?.bankDepositObserved===true;
 const payeeMatched=req.body?.recipientMatched===true;
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)||paymentRef.length<4||paymentRef.length>150)
  return res.status(400).json({error:'Invalid order or payment reference'});
 if(!bankDepositObserved||!payeeMatched)
  return res.status(400).json({error:'Recipient identity and actual bank deposit must be independently verified.'});
 if(!Number.isSafeInteger(confirmedAmount)||confirmedAmount<1||observedMemo.length<8||observedMemo.length>80)
  return res.status(400).json({error:'Valid bank deposit amount and Zelle memo are required.'});
 // Payment must be verified with an authoritative bank/processor record, not a customer's claim.
 // No direct Zelle webhook exists in this integration.
 const client=await db().connect();
 let released=false;
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(2026111501)');
  const drawn=await client.query('SELECT 1 FROM raffle_draws WHERE id=1');
  if(drawn.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'Drawing completed; no additional tickets may be verified'})}
  const o=await client.query('SELECT id,quantity,status,amount_cents,receipt_token FROM raffle_orders WHERE id=$1 FOR UPDATE',[id]);
  if(!o.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Order not found'})}
  if(o.rows[0].status==='confirmed'){await client.query('ROLLBACK');return res.status(409).json({error:'Payment already confirmed'})}
  if(o.rows[0].status!=='pending_payment'){await client.query('ROLLBACK');return res.status(409).json({error:'Order is not pending'})}
  const expectedMemo='WDG-'+String(o.rows[0].receipt_token||'').slice(0,10).toUpperCase();
  if(confirmedAmount!==Number(o.rows[0].amount_cents)){
   await client.query('ROLLBACK');
   return res.status(409).json({error:'Bank deposit amount does not match the order. Do not confirm until reconciled.'});
  }
  if(observedMemo!==expectedMemo){
   await client.query('ROLLBACK');
   return res.status(409).json({error:'Zelle memo does not match this order. Review the transaction before confirming.'});
  }
  const q=await client.query('SELECT number,verification_code FROM raffle_tickets WHERE order_id=$1 ORDER BY number FOR UPDATE',[id]);
  if(q.rowCount!==o.rows[0].quantity){await client.query('ROLLBACK');return res.status(409).json({error:'Reserved ticket count mismatch. Payment not marked confirmed.'})}
  await client.query("UPDATE raffle_orders SET status='confirmed',payment_reference=$2,confirmed_at=NOW() WHERE id=$1",[id,paymentRef]);
  await client.query("INSERT INTO raffle_audit_events(order_id,event_type,detail) VALUES($1,'order_confirmed',jsonb_build_object('quantity',$2::integer,'numbers_preserved',true,'bank_amount_cents',$3::integer,'matched_memo',$4::text,'verified_in_recipient_bank',true))",[id,o.rows[0].quantity,confirmedAmount,expectedMemo]);
  await client.query('COMMIT');
  client.release();released=true;
  res.status(200).json({orderId:id,status:'confirmed',tickets:q.rows.map(t=>({number:Number(t.number),verificationCode:t.verification_code}))});
  await Promise.allSettled([notifyOrganizers(id,'verified'),notifyCustomer(id,'verified')]);
  return;
 }catch(e){
  try{await client.query('ROLLBACK')}catch(_){}
  console.error('Payment confirmation failed',e.code||'unknown');
  return res.status(e.code==='23505'?409:500).json({error:e.code==='23505'?'Payment reference already used':'Ticket verification failed'});
 }finally{if(!released)client.release()}
};
