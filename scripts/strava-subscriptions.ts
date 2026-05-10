import { env } from '../src/shared/config/env.js';

const command = process.argv[2];

if (!command || !['list', 'create', 'delete'].includes(command)) {
  console.error('Usage: npm run strava:subscriptions -- <list|create|delete> [subscriptionId]');
  process.exit(1);
}

if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) {
  throw new Error('STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET must be configured');
}

if (command === 'list') {
  const url = new URL('https://www.strava.com/api/v3/push_subscriptions');
  url.searchParams.set('client_id', env.STRAVA_CLIENT_ID);
  url.searchParams.set('client_secret', env.STRAVA_CLIENT_SECRET);

  const response = await fetch(url);
  await printResponse(response);
}

if (command === 'create') {
  const callbackUrl = new URL('/integrations/strava/webhook', env.APP_BASE_URL).toString();
  const body = new URLSearchParams({
    client_id: env.STRAVA_CLIENT_ID,
    client_secret: env.STRAVA_CLIENT_SECRET,
    callback_url: callbackUrl,
    verify_token: env.STRAVA_WEBHOOK_VERIFY_TOKEN
  });

  const response = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  await printResponse(response);
}

if (command === 'delete') {
  const subscriptionId = process.argv[3];

  if (!subscriptionId) {
    throw new Error('subscriptionId is required for delete');
  }

  const url = new URL(`https://www.strava.com/api/v3/push_subscriptions/${subscriptionId}`);
  url.searchParams.set('client_id', env.STRAVA_CLIENT_ID);
  url.searchParams.set('client_secret', env.STRAVA_CLIENT_SECRET);

  const response = await fetch(url, { method: 'DELETE' });
  await printResponse(response);
}

async function printResponse(response: Response): Promise<void> {
  const text = await response.text();

  console.log(`Status: ${response.status}`);
  console.log(text || '<empty body>');

  if (!response.ok) {
    process.exit(1);
  }
}
