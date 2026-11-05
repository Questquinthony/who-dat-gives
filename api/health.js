const {entriesEnabled} = require('../lib/db');
module.exports = function handler(req,res) {
  if (req.method !== 'GET') {res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    project:'who-dat-gives',
    version:'0.1.0',
    mode:entriesEnabled() ? 'authorization-gated-test' : 'preview',
    paidEntriesOpen:false,
    dataStorageConfigured:Boolean(process.env.DATABASE_URL)
  });
};
