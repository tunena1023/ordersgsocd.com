const { toVercel } = require('../lib/vercel-adapter');
const { handler } = require('../recover-client-id');
module.exports = toVercel(handler);
