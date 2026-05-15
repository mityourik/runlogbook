export type DraftRun = {
  id: string;
  stravaActivityId: number | null;
  stravaActivityUrl: string | null;
  activityType: string | null;
  occurredAt: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number | null;
  title: string | null;
  workoutLaps?: WorkoutLap[];
};

export type WorkoutLap = {
  lapNumber: number;
  lapKind: 'warmup' | 'work' | 'recovery' | 'cooldown' | 'other';
  distanceMeters: number;
  correctedDistanceMeters: number | null;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  heartRateRecoveryBpm: number | null;
  needsReview: boolean;
};

export type AuthResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
};

export type DistanceSummary = {
  startDate: string;
  endDate: string;
  runCount: number;
  totalDistanceMeters: number;
  totalDistanceKm: number;
  runs: Array<{
    id: string;
    occurredOn: string;
    title: string | null;
    distanceMeters: number;
    distanceKm: number;
    durationSeconds: number;
  }>;
};

export type AnalyticsIntentPayload = {
  name: string;
  parameters: Record<string, unknown>;
  confidence?: number;
};

export type AnalyticsQueryResponse =
  | {
      status: 'answered';
      question: string;
      resolved: { source: 'rules' | 'llm' | 'user_selection'; intents: AnalyticsIntentPayload[] };
      results: Array<{ intent: string; data: unknown }>;
    }
  | {
      status: 'needs_clarification';
      question: string;
      options: Array<{ label: string; intents: AnalyticsIntentPayload[] }>;
    };

export async function register(input: { email: string; password: string; displayName: string }): Promise<AuthResponse> {
  return request('/auth/register', { method: 'POST', body: input });
}

export async function login(input: { email: string; password: string }): Promise<AuthResponse> {
  return request('/auth/login', { method: 'POST', body: input });
}

export async function listDraftRuns(token: string): Promise<DraftRun[]> {
  const response = await request<{ draftRuns: DraftRun[] }>('/runs/drafts', { token });

  return response.draftRuns;
}

export async function clarifyDraftRun(
  token: string,
  draftRunId: string,
  input: {
    occurredOn?: string;
    distanceMeters?: number;
    durationSeconds?: number;
    perceivedEffort: number;
    workoutKind: 'easy' | 'workout' | 'long' | 'race' | 'other';
    workoutStructure?: string;
    workoutLapCorrections?: Array<{ lapNumber: number; correctedDistanceMeters: number }>;
    title?: string;
    notes?: string;
  }
): Promise<void> {
  await request(`/runs/drafts/${draftRunId}/clarify`, { method: 'POST', token, body: input });
}

export async function getStravaConnectUrl(token: string): Promise<string> {
  const response = await request<{ authorizationUrl: string }>('/integrations/strava/connect-url', { token });

  return response.authorizationUrl;
}

export async function getDistanceSummary(
  token: string,
  input: { startDate: string; endDate: string }
): Promise<DistanceSummary> {
  const params = new URLSearchParams(input);
  const response = await request<{ summary: DistanceSummary }>(`/analytics/distance?${params.toString()}`, { token });

  return response.summary;
}

export async function askAnalyticsQuestion(
  token: string,
  input: { question: string; selectedOption?: { intents: AnalyticsIntentPayload[] } }
): Promise<AnalyticsQueryResponse> {
  return request('/analytics/query', { method: 'POST', token, body: input });
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
