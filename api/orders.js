const {randomUUID,randomBytes}=require('crypto');
const {db,entriesEnabled}=require('../lib/db');
const tokenRegex=/^[0-9a-f]{64}$/i;
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(!process.env.DATABASE_URL)return res.status(503).json({error:'Ticket service is unavailable'});
 if(req.method==='GET'){
  const token=String(req.query?.token||'');
  if(!tokenRegex.test(token))return res.status(400).json({error:'Invalid private receipt link'});
  try{
   const sql="SELECT o.quantity,o.amount_cents,o.status,o.created_at, COALESCE(json_agg(json_build_object('number',t.number,'code',t.verification_code) ORDER BY t.number) FILTER(WHERE t.number IS NOT NULL),'[]'::json) AS tickets FROM raffle_orders o LEFT JOIN raffle_tickets t ON t.order_id=o.id WHERE o.receipt_token=$1 GROUP BY o.id";
   const q=await db().query(sql,[token]);
   if(!q.rowCount)return res.status(404).json({error:'Receipt not found'});
   const o=q.rows[0];
   return res.status(200).json({
    quantity:o.quantity,amountCents:o.amount_cents,status:o.status,
    reserved:o.status==='pending_payment',confirmed:o.status==='confirmed',
    tickets:o.tickets.map(t=>({number:Number(t.number),url:'/ticket.html?code='+t.code})),
    createdAt:o.created_at
   });
  }catch(e){console.error('Receipt lookup failed',e.code||'unknown');return res.status(500).json({error:'Unable to load receipt'})}
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'})}
 if(!entriesEnabled())return res.status(503).json({error:'Entries are not open. No payments are being accepted.'});
 const b=req.body||{},name=String(b.name||'').trim(),
  phone=String(b.phone||'').replace(/[^0-9+() -]/g,'').trim(),
  email=b.email?String(b.email).trim().toLowerCase():null,quantity=Number(b.quantity);
 if(name.length<2||name.length>100||phone.length<7||phone.length>25||!Number.isInteger(quantity)||quantity<1||quantity>100)
  return res.status(400).json({error:'Provide a valid name, phone, and ticket quantity (1–100 per order).'});
 if(email&&(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return res.status(400).json({error:'Invalid email address.'});
 const id=randomUUID(),receiptToken=randomBytes(32).toString('hex'),amount=quantity*1500;
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  // Serialize numbering across simultaneous orders; also block new reservations after the draw.
  await client.query('SELECT pg_advisory_xact_lock(2026111501)');
  const drawn=await client.query('SELECT 1 FROM raffle_draws WHERE id=1');
  if(drawn.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'The drawing is complete; new orders are closed.'})}
  await client.query(
   "INSERT INTO raffle_orders(id,buyer_name,phone,email,quantity,amount_cents,status,receipt_token) VALUES($1,$2,$3,$4,$5,$6,'pending_payment',$7)",
   [id,name,phone,email,quantity,amount,receiptToken]
  );
  const tickets=[];
  for(let i=0;i<quantity;i++){
   const code=randomBytes(24).toString('hex');
   const item=await client.query('INSERT INTO raffle_tickets(order_id,verification_code) VALUES($1,$2) RETURNING number',[id,code]);
   tickets.push({number:Number(item.rows[0].number),url:'/ticket.html?code='+code});
  }
  await client.query("INSERT INTO raffle_audit_events(order_id,event_type,detail) VALUES($1,'ticket_numbers_reserved',jsonb_build_object('quantity',$2::integer,'payment_status','pending'))",[id,quantity]);
  await client.query('COMMIT');
  return res.status(201).json({
   status:'pending_payment',quantity,amountCents:amount,paid:false,verified:false,
   tickets,ticketsReserved:quantity,receiptUrl:'/receipt.html?token='+receiptToken,
   message:'Numbers reserved. Payment confirmation is still required before entry is valid.'
  });
 }catch(e){
  try{await client.query('ROLLBACK')}catch(_){}
  console.error('Order reservation failed',e.code||'unknown');
  return res.status(500).json({error:'Unable to reserve numbers. Please retry before paying.'});
 }finally{client.release()}
};
