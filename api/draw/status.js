const {db}=require('../../lib/db');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 if(!process.env.DATABASE_URL)return res.status(503).json({error:'Drawing status unavailable'});
 try{
  const q=await db().query('SELECT winner_ticket,drawn_at FROM raffle_draws WHERE id=1');
  return res.status(200).json(q.rowCount?{drawn:true,winnerNumber:Number(q.rows[0].winner_ticket),drawnAt:q.rows[0].drawn_at}:{drawn:false});
 }catch(e){console.error('Draw status error',e.code||'unknown');return res.status(500).json({error:'Drawing status unavailable'});}
};
