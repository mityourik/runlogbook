export type StravaTokenResponse = {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  athlete: {
    id: number;
  };
};

export type StravaActivityResponse = {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
};

export async function exchangeStravaCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
}): Promise<StravaTokenResponse> {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      grant_type: 'authorization_code'
    })
  });

  if (!response.ok) {
    throw new Error(`Strava token exchange failed with status ${response.status}`);
  }

  return (await response.json()) as StravaTokenResponse;
}

export async function refreshStravaToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<StravaTokenResponse> {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    throw new Error(`Strava token refresh failed with status ${response.status}`);
  }

  return (await response.json()) as StravaTokenResponse;
}

export async function fetchStravaActivity(input: {
  activityId: number;
  accessToken: string;
}): Promise<StravaActivityResponse> {
  const response = await fetch(`https://www.strava.com/api/v3/activities/${input.activityId}`, {
    headers: { authorization: `Bearer ${input.accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Strava activity fetch failed with status ${response.status}`);
  }

  return (await response.json()) as StravaActivityResponse;
}
