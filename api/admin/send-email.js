const {db,entriesEnabled}=require('../../lib/db');
const authorized=require('../../lib/admin-auth');
const {notifyCustomer,configured}=require('../../lib/order-mail');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'})}
 if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
 if(!entriesEnabled())return res.status(503).json({error:'Official order email delivery is not enabled'});
 if(!configured())return res.status(503).json({error:'Gmail sender is not configured'});
 const id=String(req.body?.orderId||'');
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))return res.status(400).json({error:'Invalid order ID'});
 try{
  const q=await db().query('SELECT id,email,status FROM raffle_orders WHERE id=$1',[id]);
  if(!q.rowCount)return res.status(404).json({error:'Order not found'});
  const order=q.rows[0];
  if(!order.email)return res.status(409).json({error:'Customer did not provide an email address'});
  const stage=order.status==='confirmed'?'verified':order.status==='pending_payment'?'reserved':null;
  if(!stage)return res.status(409).json({error:'Order is not active'});
  const outcome=await notifyCustomer(id,stage);
  if(outcome.alreadyProcessed)return res.status(200).json({status:'already_sent'});
  if(outcome.sent===1)return res.status(200).json({status:'sent',stage});
  return res.status(502).json({error:'Email not sent. Check sender credentials and try again.'});
 }catch(e){console.error('Customer email retry failed',e.code||'unknown');return res.status(500).json({error:'Unable to retry customer email'})}
};
