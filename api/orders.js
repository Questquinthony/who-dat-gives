const { randomUUID } = require('crypto');
const {db,entriesEnabled} = require('../lib/db');
module.exports = async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  if(!entriesEnabled()) return res.status(503).json({error:'Entries are not open. No payments are being accepted.'});
  if(!process.env.DATABASE_URL) return res.status(503).json({error:'Order system is not configured.'});
  const b=req.body||{};
  const name=String(b.name||'').trim();
  const phone=String(b.phone||'').replace(/[^0-9+() -]/g,'').trim();
  const email=b.email?String(b.email).trim().toLowerCase():null;
  const quantity=Number(b.quantity);
  if(name.length<2||name.length>100||phone.length<7||phone.length>25||!Number.isInteger(quantity)||quantity<1||quantity>100){
    return res.status(400).json({error:'Provide a valid name, phone, and entry quantity (1–100 per order).'});
  }
  if(email && (email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return res.status(400).json({error:'Invalid email address.'});
  const id=randomUUID(), amount=quantity*1500;
  try{
    await db().query(
      'INSERT INTO raffle_orders(id,buyer_name,phone,email,quantity,amount_cents,status) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [id,name,phone,email,quantity,amount,'pending_payment']
    );
    return res.status(201).json({orderId:id,status:'pending_payment',quantity,amountCents:amount,paid:false,ticketsIssued:0});
  }catch(e){console.error('Order creation error',e.code||'unknown');return res.status(500).json({error:'Unable to create order.'});}
};
