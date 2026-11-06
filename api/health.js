const {checkoutReady} = require('../lib/db');
const hasFamilyInvite = require('../lib/family-invite');
module.exports = function handler(req,res) {
  if (req.method !== 'GET') {res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  res.setHeader('Cache-Control','no-store, private');
  return res.status(200).json({
    project:'who-dat-gives',
    version:'0.1.0',
    mode:checkoutReady() ? 'open' : 'preview',
    paidEntriesOpen:checkoutReady(),
    invitationAccepted:hasFamilyInvite(req),
    paymentMethod:checkoutReady()?'Zelle':null,
    dataStorageConfigured:Boolean(process.env.DATABASE_URL)
  });
};
