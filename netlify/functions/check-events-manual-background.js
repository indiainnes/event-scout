const { runCheck } = require('./lib/eventChecker');

// Background functions must respond quickly, then keep working after that.
// The actual result is picked up by the frontend via get-status, not this response.
exports.handler = async () => {
  try {
    await runCheck();
  } catch (err) {
    console.error('Background check failed:', err);
  }
  return { statusCode: 202 };
};
