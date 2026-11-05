const nodemailer=require('nodemailer');
const {db}=require('./db');
function recipients(){
 return [...new Set(String(process.env.ORDER_NOTIFY_EMAILS||'')
  .split(',').map(x=>x.trim().toLowerCase()).filter(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))].slice(0,5);
}
function configured(){
 return Boolean(process.env.GMAIL_SMTP_USER&&process.env.GMAIL_SMTP_APP_PASSWORD&&recipients().length);
}
async function notifyOrganizers(orderId,stage){
 if(!configured())return {configured:false};
 try{
  const r=await db().query(
   "SELECT o.id,o.buyer_name,o.phone,o.email,o.quantity,o.amount_cents,o.status,array_agg(t.number ORDER BY t.number) AS numbers FROM raffle_orders o JOIN raffle_tickets t ON t.order_id=o.id WHERE o.id=$1 GROUP BY o.id",
   [orderId]
  );
  if(!r.rowCount)return {configured:true,sent:0};
  const order=r.rows[0];
  const expected=stage==='verified'?'confirmed':'pending_payment';
  if(order.status!==expected)return {configured:true,sent:0};
  const sender=process.env.GMAIL_SMTP_USER;
  const client=nodemailer.createTransport({
   host:'smtp.gmail.com',port:465,secure:true,
   auth:{user:sender,pass:process.env.GMAIL_SMTP_APP_PASSWORD},
   connectionTimeout:7000,greetingTimeout:5000,socketTimeout:9000
  });
  let sent=0;
  for(const to of recipients()){
   const claim=await db().query(
    "INSERT INTO raffle_notification_deliveries(order_id,event_type,recipient,status,last_attempt_at) VALUES($1,$2,$3,'sending',NOW()) ON CONFLICT(order_id,event_type,recipient) DO UPDATE SET status='sending',last_attempt_at=NOW() WHERE raffle_notification_deliveries.status='failed' RETURNING order_id",
    [orderId,stage,to]
   );
   if(!claim.rowCount)continue;
   const subject='Who Dat Gives: '+(stage==='verified'?'Payment Verified':'New Order · Payment Pending');
   const numbers=order.numbers.map(x=>String(x).padStart(2,'0')).join(', ');
   const body=[
    'Who Dat Gives — Organizer Notification',
    'Payment status: '+(stage==='verified'?'VERIFIED':'NOT YET VERIFIED'),
    'Customer: '+order.buyer_name,
    'Phone: '+order.phone,
    'Email: '+(order.email||'Not provided'),
    'Number of tickets: '+order.quantity,
    'Ticket numbers: '+numbers,
    'Amount: $'+(Number(order.amount_cents)/100).toFixed(2),
    'Order ID: '+order.id,
    '',
    'Only bank-verified orders become eligible for the host drawing.',
    'See your private organizer dashboard for order records.'
   ].join('\n');
   try{
    await client.sendMail({from:{name:'Who Dat Gives',address:sender},to,subject,text:body});
    await db().query("UPDATE raffle_notification_deliveries SET status='sent',sent_at=NOW(),error_code=NULL WHERE order_id=$1 AND event_type=$2 AND recipient=$3",[orderId,stage,to]);
    sent++;
   }catch(e){
    console.error('Gmail notification delivery failed',e.code||e.name||'unknown');
    await db().query("UPDATE raffle_notification_deliveries SET status='failed',error_code=$4 WHERE order_id=$1 AND event_type=$2 AND recipient=$3",[orderId,stage,to,String(e.code||e.name||'error').slice(0,80)]).catch(()=>{});
   }
  }
  client.close();
  return {configured:true,sent};
 }catch(e){
  console.error('Order notification error',e.code||e.name||'unknown');
  return {configured:true,sent:0};
 }
}
async function sendTestNotification(){
 if(!configured())return {configured:false,sent:0};
 const sender=process.env.GMAIL_SMTP_USER;
 const transport=nodemailer.createTransport({
  host:'smtp.gmail.com',port:465,secure:true,
  auth:{user:sender,pass:process.env.GMAIL_SMTP_APP_PASSWORD},
  connectionTimeout:7000,greetingTimeout:5000,socketTimeout:9000
 });
 let sent=0;
 for(const to of recipients()){
  try{
   await transport.sendMail({
    from:{name:'Who Dat Gives',address:sender},to,
    subject:'Who Dat Gives — Test Notification',
    text:'This is a test of the Who Dat Gives order notification system. No purchase was made, no payment was sent, and no ticket was issued. If you received this message, your notification inbox is connected.'
   });
   sent++;
  }catch(e){console.error('Gmail test email failed',e.code||e.name||'unknown')}
 }
 transport.close();
 return {configured:true,sent,intended:recipients().length};
}
module.exports={notifyOrganizers,sendTestNotification,configured,recipients};
