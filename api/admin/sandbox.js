const {randomUUID,randomBytes}=require('crypto');
const {db}=require('../../lib/db');
const authorized=require('../../lib/admin-auth');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
 if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
 if(!process.env.DATABASE_URL)return res.status(503).json({error:'Test database unavailable'});
 try{
  if(req.method==='GET'){
   if(req.query?.pool==='1'){
    const r=await db().query("SELECT t.number FROM raffle_demo_tickets t JOIN raffle_demo_orders o ON o.id=t.order_id WHERE o.status='confirmed' ORDER BY t.number");
    return res.status(200).json({sandbox:true,count:r.rowCount,numbers:r.rows.map(x=>Number(x.number))});
   }
   const [orders,totals]=await Promise.all([
    db().query("SELECT o.id,o.nickname,o.quantity,o.status,o.created_at,o.confirmed_at,COALESCE(json_agg(json_build_object('number',t.number,'code',t.verification_code) ORDER BY t.number) FILTER(WHERE t.number IS NOT NULL),'[]'::json) AS tickets FROM raffle_demo_orders o LEFT JOIN raffle_demo_tickets t ON t.order_id=o.id GROUP BY o.id ORDER BY o.created_at DESC LIMIT 200"),
    db().query("SELECT (SELECT count(*)::int FROM raffle_demo_orders) AS total_orders,(SELECT count(*)::int FROM raffle_demo_tickets) AS issued_tickets")
   ]);
   return res.status(200).json({sandbox:true,orders:orders.rows,stats:totals.rows[0]});
  }
  const action=String(req.body?.action||'');
  if(action==='create'){
   const nickname=String(req.body?.nickname||'').trim(),quantity=Number(req.body?.quantity);
   if(nickname.length<2||nickname.length>60||!Number.isInteger(quantity)||quantity<1||quantity>100)return res.status(400).json({error:'Enter a sample nickname (2–60 characters) and 1–100 test entries.'});
   const id=randomUUID(),client=await db().connect();
   try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(2026111502)');
    await client.query("INSERT INTO raffle_demo_orders(id,nickname,quantity,status) VALUES($1,$2,$3,'pending')",[id,nickname,quantity]);
    const tickets=[];
    for(let i=0;i<quantity;i++){
     const code=randomBytes(24).toString('hex');
     const t=await client.query('INSERT INTO raffle_demo_tickets(order_id,verification_code) VALUES($1,$2) RETURNING number',[id,code]);
     tickets.push({number:Number(t.rows[0].number),code});
    }
    await client.query('COMMIT');
    return res.status(201).json({sandbox:true,orderId:id,status:'pending',quantity,paid:false,confirmed:false,ticketsReserved:tickets.length,tickets});
   }catch(e){
    try{await client.query('ROLLBACK')}catch(_){}
    console.error('Sandbox reservation failed',e.code||'unknown');
    return res.status(500).json({error:'Unable to reserve practice ticket numbers'});
   }finally{client.release()}
  }
  if(action==='confirm'){
   const id=String(req.body?.orderId||'');
   if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))return res.status(400).json({error:'Invalid test order ID'});
   const client=await db().connect();
   try{
    await client.query('BEGIN');
    const order=await client.query('SELECT id,quantity,status FROM raffle_demo_orders WHERE id=$1 FOR UPDATE',[id]);
    if(!order.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Test order not found'})}
    if(order.rows[0].status!=='pending'){await client.query('ROLLBACK');return res.status(409).json({error:'Test order already approved'})}
    const tickets=await client.query('SELECT number,verification_code FROM raffle_demo_tickets WHERE order_id=$1 ORDER BY number FOR UPDATE',[id]);
    if(tickets.rowCount!==order.rows[0].quantity){await client.query('ROLLBACK');return res.status(409).json({error:'Reserved number count mismatch'})}
    await client.query("UPDATE raffle_demo_orders SET status='confirmed',confirmed_at=NOW() WHERE id=$1",[id]);
    await client.query('COMMIT');
    return res.status(200).json({sandbox:true,status:'confirmed',orderId:id,tickets:tickets.rows.map(t=>({number:Number(t.number),code:t.verification_code}))});
   }catch(e){
    try{await client.query('ROLLBACK')}catch(_){}
    console.error('Sandbox approval failed',e.code||'unknown');
    return res.status(500).json({error:'Unable to approve practice tickets'});
   }finally{client.release()}
  }
  return res.status(400).json({error:'Unknown sandbox operation'});
 }catch(e){
  console.error('Sandbox operation failed',e.code||'unknown');
  return res.status(500).json({error:'Practice system temporarily unavailable'});
 }
};
