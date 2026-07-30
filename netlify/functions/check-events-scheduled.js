const { schedule } = require('@netlify/functions');
const { runCheck } = require('./lib/eventChecker');

// Cron: at 07:00 UTC, every 14th day, starting from day 1 of the month.
// (Netlify's scheduler runs continuously, so "every 14 days" is approximated by
// running on day-of-month 1 and 15 — close enough to fortnightly for this use case.)
const handler = async () => {
  const result = await runCheck();
  console.log('Scheduled event check complete:', JSON.stringify(result));
  return { statusCode: 200 };
};

module.exports.handler = schedule('0 7 1,15 * *', handler);
