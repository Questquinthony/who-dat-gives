const { timingSafeEqual } = require('node:crypto');

const inviteFormat = /^[a-f0-9]{64}$/;

module.exports = function hasFamilyInvite(req) {
 const expected = process.env.FAMILY_INVITE_KEY || '';
 const supplied = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
 if (!inviteFormat.test(expected) || !supplied) return false;
 return timingSafeEqual(Buffer.from(supplied[1], 'hex'), Buffer.from(expected, 'hex'));
};
