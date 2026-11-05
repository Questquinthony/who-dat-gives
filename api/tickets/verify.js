const {db}=require('../_db');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  const code=String(req.query?.code||'');
  if(!/^[a-f0-9]{48}$/.test(code))return res.status(400).json({valid:false});
  if(!process.env.DATABASE_URL)return res.status(503).json({error:'Verification unavailable'});
  try{
    const result=await db().query(
      "SELECT t.number FROM raffle_tickets t JOIN raffle_orders o ON o.id=t.order_id WHERE t.verification_code=$1 AND o.status='confirmed'",
      [code]
    );
    if(!result.rowCount)return res.status(200).json({valid:false});
    return res.status(200).json({valid:true,number:Number(result.rows[0].number)});
  }catch(e){console.error('Verify error',e.code||'unknown');return res.status(500).json({error:'Verification unavailable'});}
};
