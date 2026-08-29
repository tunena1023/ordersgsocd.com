const { toVercel } = require('../lib/vercel-adapter');
const { handler } = require('../request-change');
module.exports = toVercel(handler);
