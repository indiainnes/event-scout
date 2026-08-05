const { schedule } = require('@netlify/functions');

// Scheduled functions only get 30 seconds to run - nowhere near enough for a
// live web search. So this just triggers the background function (which has
// a much longer time limit) rather than doing the work itself.
const handler = async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_URL;
  if (!siteUrl) {
    console.error('No site URL available to trigger the background check.');
    return { statusCode: 500 };
  }

  await fetch(`${siteUrl}/.netlify/functions/check-events-manual-background`, {
    method: 'POST',
  }).catch((err) => console.error('Failed to trigger background check:', err));

  console.log('Triggered the background event check.');
  return { statusCode: 200 };
};

module.exports.handler = schedule('0 7 1,15 * *', handler);
