const { toVercel } = require('../lib/vercel-adapter');
const { handler } = require('../get-orders');
module.exports = toVercel(handler);
