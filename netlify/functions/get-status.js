const { getKnownEvents, getLastRun } = require('./lib/eventChecker');

exports.handler = async () => {
  const [knownEvents, lastRun] = await Promise.all([getKnownEvents(), getLastRun()]);
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ knownEvents, lastRun }),
  };
};
