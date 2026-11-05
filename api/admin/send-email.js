const {db,entriesEnabled}=require('../../lib/db');
const authorized=require('../../lib/admin-auth');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
 if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
 if(!entriesEnabled())return res.status(503).json({error:'Ticket delivery is not enabled'});
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM||!process.env.SITE_URL)return res.status(503).json({error:'Email provider is not configured'});
 const id=String(req.body?.orderId||'');
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))return res.status(400).json({error:'Invalid order ID'});
 try{
  const q=await db().query('SELECT id,buyer_name,email,quantity,status FROM raffle_orders WHERE id=$1',[id]);
  if(!q.rowCount)return res.status(404).json({error:'Order not found'});
  const o=q.rows[0];
  if(o.status!=='confirmed'||!o.email)return res.status(409).json({error:'Confirmed order with email required'});
  const previous=await db().query('SELECT status FROM raffle_email_deliveries WHERE order_id=$1',[id]);
  if(previous.rows[0]?.status==='sent')return res.status(200).json({status:'already_sent'});
  const tickets=await db().query('SELECT number,verification_code FROM raffle_tickets WHERE order_id=$1 ORDER BY number',[id]);
  if(tickets.rowCount!==o.quantity)return res.status(409).json({error:'Ticket count mismatch; no email sent'});
  const origin=new URL(process.env.SITE_URL);
  if(origin.protocol!=='https:')return res.status(503).json({error:'Secure SITE_URL required'});
  const items=tickets.rows.map(t=>{
   const link=new URL('/ticket.html',origin);link.searchParams.set('code',t.verification_code);
   return '<li>Ticket #'+escape(String(t.number).padStart(2,'0'))+' — <a href="'+escape(link.toString())+'">View and verify ticket</a></li>';
  }).join('');
  const html='<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px">'+
   '<h1>Who Dat Gives — Ticket Confirmation</h1><p>Thank you, '+escape(o.buyer_name)+'.</p>'+
   '<p>Your '+o.quantity+' verified ticket(s) for the Saints community event are listed below.</p><ol>'+items+'</ol>'+
   '<p>Save these links or take a screenshot of each ticket. A QR code is shown on the ticket page.</p>'+
   '<p>This independent community initiative is not affiliated with the NFL or New Orleans Saints.</p></div>';
  const sent=await fetch('https://api.resend.com/emails',{
   method:'POST',
   headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'who-dat-confirmation-'+id},
   body:JSON.stringify({from:process.env.EMAIL_FROM,to:[o.email],subject:'Who Dat Gives — Your Ticket Confirmation',html})
  });
  const result=await sent.json().catch(()=>({}));
  if(!sent.ok||!result.id){
   await db().query("INSERT INTO raffle_email_deliveries(order_id,status,last_attempt_at,error_code) VALUES($1,'failed',NOW(),$2) ON CONFLICT(order_id) DO UPDATE SET status='failed',last_attempt_at=NOW(),error_code=$2",[id,String(result.name||'provider_error').slice(0,100)]);
   return res.status(502).json({error:'Email provider rejected delivery. Check sender verification.'});
  }
  await db().query("INSERT INTO raffle_email_deliveries(order_id,status,provider_email_id,last_attempt_at,sent_at,error_code) VALUES($1,'sent',$2,NOW(),NOW(),NULL) ON CONFLICT(order_id) DO UPDATE SET status='sent',provider_email_id=$2,last_attempt_at=NOW(),sent_at=NOW(),error_code=NULL",[id,result.id]);
  await db().query("INSERT INTO raffle_audit_events(order_id,event_type,detail) VALUES($1,'confirmation_email_sent',jsonb_build_object('provider','resend'))",[id]);
  return res.status(200).json({status:'sent'});
 }catch(e){console.error('Email delivery error',e.code||'unknown');return res.status(500).json({error:'Unable to process email delivery'});}
};
