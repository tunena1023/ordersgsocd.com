const { toVercel } = require('../lib/vercel-adapter');
const { handler } = require('../undo-request');
module.exports = toVercel(handler);
