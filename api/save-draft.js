const { toVercel } = require('../lib/vercel-adapter');
const { handler } = require('../save-draft');
module.exports = toVercel(handler);
