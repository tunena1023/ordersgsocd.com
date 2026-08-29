const { toVercel } = require('../lib/vercel-adapter');
const { handler } = require('../submit-contact');
module.exports = toVercel(handler);
