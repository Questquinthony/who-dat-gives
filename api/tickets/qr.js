const QRCode=require('qrcode');
const {db}=require('../../lib/db');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 const code=String(req.query?.code||'');
 if(!/^[a-f0-9]{48}$/.test(code))return res.status(400).send('Invalid verification code');
 if(!process.env.DATABASE_URL)return res.status(503).send('Database not configured');
 try{
  const r=await db().query("SELECT t.number FROM raffle_tickets t JOIN raffle_orders o ON o.id=t.order_id WHERE t.verification_code=$1 AND o.status='confirmed'",[code]);
  if(!r.rowCount)return res.status(404).send('Ticket not found');
  const origin=new URL(process.env.SITE_URL||'https://who-dat-gives.vercel.app');
  if(origin.protocol!=='https:')return res.status(503).send('Site origin not configured');
  const url=new URL('/ticket.html',origin);url.searchParams.set('code',code);
  const svg=await QRCode.toString(url.toString(),{type:'svg',errorCorrectionLevel:'M',margin:2,width:240});
  res.setHeader('Content-Type','image/svg+xml; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(200).send(svg);
 }catch(e){console.error('QR failure',e.code||'unknown');return res.status(500).send('QR unavailable');}
};
