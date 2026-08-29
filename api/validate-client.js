const { toVercel } = require('../lib/vercel-adapter');
const { handler } = require('../validate-client');
module.exports = toVercel(handler);
