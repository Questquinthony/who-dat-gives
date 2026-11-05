const QRCode=require('qrcode');
const {db}=require('../../lib/db');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).send('Method not allowed')}
 const code=String(req.query?.code||'');
 if(!/^[a-f0-9]{48}$/.test(code))return res.status(400).send('Invalid demo code');
 try{
  const q=await db().query("SELECT t.number FROM raffle_demo_tickets t JOIN raffle_demo_orders o ON o.id=t.order_id WHERE t.verification_code=$1 AND o.status='confirmed'",[code]);
  if(!q.rowCount)return res.status(404).send('Demo ticket not found');
  const host=String(req.headers.host||'').toLowerCase().split(':')[0];
  const origin=/^who-dat-gives(?:-[a-z0-9-]+)?\.vercel\.app$/.test(host)?'https://'+host:process.env.SITE_URL;
  if(!origin||new URL(origin).protocol!=='https:')return res.status(503).send('Secure site URL not set');
  const url=new URL('/sandbox-ticket.html',origin);url.searchParams.set('code',code);
  const svg=await QRCode.toString(url.toString(),{type:'svg',errorCorrectionLevel:'M',margin:2,width:240});
  res.setHeader('Content-Type','image/svg+xml; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(200).send(svg);
 }catch(e){console.error('Sandbox QR failed',e.code||'unknown');return res.status(500).send('Practice QR unavailable')}
};
