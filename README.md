# Event Scout

A small internal tool that checks the web every 14 days (or on demand) for new/changed
major UK & Europe events — sports, festivals, bank holidays, etc. — compares them against
what's already tracked, and emails the team when it finds something new.

No Claude account needed for anyone on the team — it's just a webpage with a button.

## What's in here

- `public/index.html` — the page your team visits. Shows the tracked events and has a
  "Check for new events now" button.
- `netlify/functions/check-events-scheduled.js` — runs automatically on a cron schedule
  (currently the 1st and 15th of each month, i.e. roughly fortnightly).
- `netlify/functions/check-events-manual.js` — same logic, triggered by the button.
- `netlify/functions/get-status.js` — feeds the page its data.
- `netlify/functions/lib/eventChecker.js` — the shared logic (both triggers call this,
  so behaviour never drifts between "automatic" and "manual").
- `data/seed-events.json` — your current event list (converted from the spreadsheet you
  shared), used to seed the tool the first time it runs.

## One-time setup (about 15–20 minutes)

### 1. Get an Anthropic API key
Go to [platform.claude.com](https://platform.claude.com), create an API key, and put a small
amount of credit on the account (pay-as-you-go — this is separate from any claude.ai
subscription). Each fortnightly check will cost a small fraction of a dollar.

### 2. Get a Resend API key (for sending the email)
Sign up free at [resend.com](https://resend.com), verify a sending domain (or use their test
domain while you try this out), and grab an API key. Free tier covers this easily.

### 3. Push this folder to a GitHub repo
Netlify deploys from a git repo, so create a new repo and push these files to it.

### 4. Connect the repo to Netlify
In your Netlify dashboard: **Add new site → Import an existing project**, pick the repo.
Build settings are already defined in `netlify.toml`, so you shouldn't need to change anything.

### 5. Add environment variables
In **Site settings → Environment variables**, add:

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Anthropic API key |
| `RESEND_API_KEY` | your Resend API key |
| `TEAM_EMAIL` | the address(es) to alert, comma-separated |
| `FROM_EMAIL` | the "from" address (must be on your verified Resend domain) |

### 6. Deploy
Trigger a deploy (push a commit, or click "Deploy site"). Netlify Blobs (the storage used
to remember which events are already known) works automatically — nothing to configure.

### 7. Try it
Open the site, click "Check for new events now," and confirm you get a sensible result and
an email. First run may take 30–60 seconds since it's doing live web research.

## Adjusting things later

- **What it searches for**: edit `SEARCH_SCOPE` in `netlify/functions/lib/eventChecker.js`.
- **How often it runs automatically**: edit the cron expression at the bottom of
  `check-events-scheduled.js` (currently `0 7 1,15 * *` — 07:00 UTC on the 1st and 15th).
- **Email design**: edit the `html` template in `sendAlertEmail()` in `eventChecker.js`.

## A note on the "official" calendar

This tool tracks its own internal list (in Netlify Blobs) purely so it knows what's
already been seen and doesn't flag the same event twice. It does **not** write to your
internal company website automatically — someone still needs to manually add confirmed
new events there. If your internal site has an admin API, that's a natural next step to
automate, but it's a separate integration.
