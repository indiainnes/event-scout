// Shared logic used by both the scheduled and manual-trigger functions.
// Keeps ONE code path so "run every 14 days" and "run now" always behave identically.

const { getStore } = require('@netlify/blobs');
const seedEvents = require('../../../data/seed-events.json');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TEAM_EMAIL = process.env.TEAM_EMAIL; // comma-separated list of recipients
const FROM_EMAIL = process.env.FROM_EMAIL || 'events@yourcompany.com';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;
const NETLIFY_BLOBS_TOKEN = process.env.NETLIFY_BLOBS_TOKEN;

// Edit this to match what your team actually tracks.
const SEARCH_SCOPE = `major sporting events, music festivals, public/bank holidays,
cultural festivals, political party conferences (UK party conference season, EU/European
party events), and other large public events taking place across the UK and Europe
over the next 12 months`;

function eventsStore() {
  if (NETLIFY_SITE_ID && NETLIFY_BLOBS_TOKEN) {
    return getStore({
      name: 'event-calendar',
      siteID: NETLIFY_SITE_ID,
      token: NETLIFY_BLOBS_TOKEN,
    });
  }
  return getStore('event-calendar');
}

async function getKnownEvents() {
  const store = eventsStore();
  const existing = await store.get('known-events.json', { type: 'json' }).catch(() => null);
  return existing || seedEvents;
}

async function getLastRun() {
  const store = eventsStore();
  return (await store.get('last-run.json', { type: 'json' }).catch(() => null)) || null;
}

async function saveKnownEvents(events) {
  const store = eventsStore();
  await store.setJSON('known-events.json', events);
}

async function saveLastRun(meta) {
  const store = eventsStore();
  await store.setJSON('last-run.json', meta);
}

async function callClaude(knownEvents) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set in Netlify environment variables.');
  }

  const prompt = `You help a UK/Europe-based company keep an events calendar up to date.

Search the web for ${SEARCH_SCOPE}.

Here is the list of events already known and tracked (JSON):
${JSON.stringify(knownEvents, null, 2)}

Compare what you find against this list. Only include an event in your answer if it is:
- genuinely NOT in the known list, OR
- already in the list but with a materially different date or location than what's shown.

Respond with ONLY a JSON array (no prose, no markdown fences) where each item has:
{
  "name": string,
  "dates": string (e.g. "14/08/2027 - 16/08/2027"),
  "locations": string,
  "notes": string (short, e.g. "new event" or "date changed from X to Y"),
  "source": string (a URL supporting this)
}

If there is genuinely nothing new or changed, respond with an empty JSON array: []`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 15 }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const textBlocks = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const jsonMatch = textBlocks.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`Could not find a JSON array in Claude's response: ${textBlocks.slice(0, 500)}`);
  }

  return JSON.parse(jsonMatch[0]);
}

async function sendAlertEmail(newEvents) {
  if (!RESEND_API_KEY || !TEAM_EMAIL) {
    return { sent: false, reason: 'RESEND_API_KEY or TEAM_EMAIL not configured' };
  }

  const rows = newEvents
    .map(
      (e) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;font-weight:600;">${e.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;">${e.dates}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;">${e.locations || ''}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;color:#666;">${e.notes || ''}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;"><a href="${e.source}">source</a></td>
        </tr>`
    )
    .join('');

  const html = `
    <h2>New or changed events found</h2>
    <p>These aren't yet on the events calendar on the internal site. Please review and add:</p>
    <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px;">
      <thead>
        <tr style="background:#f5f5f5;text-align:left;">
          <th style="padding:8px 12px;">Event</th>
          <th style="padding:8px 12px;">Date(s)</th>
          <th style="padding:8px 12px;">Location</th>
          <th style="padding:8px 12px;">Notes</th>
          <th style="padding:8px 12px;">Source</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: TEAM_EMAIL.split(',').map((s) => s.trim()),
      subject: `${newEvents.length} new event(s) found for the calendar`,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend API error ${response.status}: ${text}`);
  }

  return { sent: true };
}

async function runCheck() {
  const known = await getKnownEvents();
  const newEventsRaw = await callClaude(known);
  const ranAt = new Date().toISOString();
  const newEvents = newEventsRaw.map((e) => ({ ...e, foundAt: ranAt }));

  let emailResult = { sent: false, reason: 'no new events' };
  if (newEvents.length > 0) {
    emailResult = await sendAlertEmail(newEvents);
    // Merge into the known list so we don't flag the same event again next time.
    await saveKnownEvents([...known, ...newEvents]);
  }

  const runMeta = {
    ranAt,
    newEventsFound: newEvents.length,
    newEvents,
    emailResult,
  };
  await saveLastRun(runMeta);
  return runMeta;
}

module.exports = { runCheck, getKnownEvents, getLastRun };
