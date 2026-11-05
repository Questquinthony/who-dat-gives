const {db}=require('../../lib/db');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'})}
 const code=String(req.query?.code||'');
 if(!/^[a-f0-9]{48}$/.test(code))return res.status(400).json({valid:false,sandbox:true});
 try{
  const q=await db().query("SELECT t.number FROM raffle_demo_tickets t JOIN raffle_demo_orders o ON o.id=t.order_id WHERE t.verification_code=$1 AND o.status='confirmed'",[code]);
  return res.status(200).json(q.rowCount?{sandbox:true,valid:true,number:Number(q.rows[0].number)}:{sandbox:true,valid:false});
 }catch(e){console.error('Sandbox verify error',e.code||'unknown');return res.status(503).json({error:'Practice ticket lookup unavailable'})}
};
