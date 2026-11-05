const {timingSafeEqual}=require('crypto');
module.exports=function authorized(req){
  const expected=process.env.ADMIN_CONFIRM_KEY||'';
  const header=String(req.headers.authorization||'');
  const match=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(header);
  if(expected.length<32||!match)return false;
  const a=Buffer.from(match[1]), b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
};
