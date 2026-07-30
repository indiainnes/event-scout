const { runCheck } = require('./lib/eventChecker');

exports.handler = async () => {
  try {
    const result = await runCheck();
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
