const { toVercel } = require('../lib/vercel-adapter');
const { handler } = require('../delete-draft');
module.exports = toVercel(handler);
