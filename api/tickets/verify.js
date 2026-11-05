const {db}=require('../../lib/db');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'})}
 const code=String(req.query?.code||''),sandbox=req.query?.demo==='1';
 if(!/^[a-f0-9]{48}$/.test(code))return res.status(400).json({valid:false,sandbox});
 if(!process.env.DATABASE_URL)return res.status(503).json({error:'Ticket verification unavailable'});
 try{
  const sql=sandbox
   ?"SELECT t.number,o.status FROM raffle_demo_tickets t JOIN raffle_demo_orders o ON o.id=t.order_id WHERE t.verification_code=$1"
   :"SELECT t.number,o.status FROM raffle_tickets t JOIN raffle_orders o ON o.id=t.order_id WHERE t.verification_code=$1";
  const q=await db().query(sql,[code]);
  if(!q.rowCount)return res.status(200).json({valid:false,sandbox});
  const confirmed=q.rows[0].status==='confirmed';
  return res.status(200).json({
   valid:confirmed,pending:!confirmed&&['pending','pending_payment'].includes(q.rows[0].status),
   sandbox,number:Number(q.rows[0].number),status:q.rows[0].status
  });
 }catch(e){console.error('Ticket verification failed',e.code||'unknown');return res.status(500).json({error:'Ticket verification unavailable'})}
};
