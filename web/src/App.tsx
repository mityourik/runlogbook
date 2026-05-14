import { useEffect, useState } from 'react';
import {
  clarifyDraftRun,
  getDistanceSummary,
  getStravaConnectUrl,
  listDraftRuns,
  login,
  register,
  type DistanceSummary,
  type DraftRun
} from './api.js';

type AuthMode = 'login' | 'register';
type AppMode = 'draft' | 'analytics';
type WorkoutKind = 'easy' | 'workout' | 'long' | 'race' | 'other';
type Step =
  | 'distance'
  | 'duration'
  | 'activityType'
  | 'title'
  | 'workoutKind'
  | 'workoutStructure'
  | 'workoutLapReview'
  | 'effort'
  | 'note'
  | 'summary';

type Clarification = {
  occurredOn?: string;
  distanceMeters?: number;
  durationSeconds?: number;
  title?: string;
  workoutKind?: WorkoutKind;
  workoutStructure?: string;
  workoutLapCorrections?: Array<{ lapNumber: number; correctedDistanceMeters: number }>;
  perceivedEffort?: number;
  notes?: string;
};

const tokenStorageKey = 'runlogbook.token';

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem(tokenStorageKey));
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [appMode, setAppMode] = useState<AppMode>('draft');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [draftRuns, setDraftRuns] = useState<DraftRun[]>([]);
  const [activeDraft, setActiveDraft] = useState<DraftRun | null>(null);
  const [clarification, setClarification] = useState<Clarification>({});
  const [step, setStep] = useState<Step>('effort');
  const [textValue, setTextValue] = useState('');
  const [analyticsQuery, setAnalyticsQuery] = useState('дай мне километраж за неделю');
  const [distanceSummary, setDistanceSummary] = useState<DistanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    void refreshDraftRuns(token);
  }, [token]);

  async function refreshDraftRuns(authToken: string) {
    setIsLoading(true);
    setError(null);
    try {
      const drafts = await listDraftRuns(authToken);
      const sortedDrafts = [...drafts].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
      );
      const newestDraft = sortedDrafts[0] ?? null;

      setDraftRuns(sortedDrafts);
      setActiveDraft(newestDraft);

      if (newestDraft) {
        setClarification({});
        setStep(getFirstStep(newestDraft));
      }
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setIsLoading(false);
    }
  }

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response =
        authMode === 'register'
          ? await register({ email, password, displayName })
          : await login({ email, password });

      localStorage.setItem(tokenStorageKey, response.token);
      setToken(response.token);
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setIsLoading(false);
    }
  }

  async function saveRun() {
    if (!token || !activeDraft || !clarification.perceivedEffort || !clarification.workoutKind) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await clarifyDraftRun(token, activeDraft.id, {
        occurredOn: clarification.occurredOn,
        distanceMeters: clarification.distanceMeters,
        durationSeconds: clarification.durationSeconds,
        perceivedEffort: clarification.perceivedEffort,
        workoutKind: clarification.workoutKind,
        workoutStructure: clarification.workoutStructure,
        workoutLapCorrections: clarification.workoutLapCorrections,
        title: clarification.title,
        notes: clarification.notes
      });
      await refreshDraftRuns(token);
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setIsLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(tokenStorageKey);
    setToken(null);
    setDraftRuns([]);
    setActiveDraft(null);
  }

  async function connectStrava() {
    if (!token) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      window.location.href = await getStravaConnectUrl(token);
    } catch (caught) {
      setError(readError(caught));
      setIsLoading(false);
    }
  }

  async function submitAnalyticsQuery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      return;
    }

    const period = parseAnalyticsPeriod(analyticsQuery);

    if (!period) {
      setError('Укажи период: например “за 5 дней”, “за неделю” или “с 01.05.2026 по 14.05.2026”.');
      return;
    }

    setIsAnalyticsLoading(true);
    setError(null);
    try {
      setDistanceSummary(await getDistanceSummary(token, period));
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setIsAnalyticsLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="shell auth-shell">
        <section className="auth-card">
          <p className="eyebrow">Runlogbook</p>
          <h1>One question after every run.</h1>
          <p className="muted">Sign in to clarify Strava imports and build a useful training log.</p>
          <form onSubmit={submitAuth} className="stack">
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
            </label>
            {authMode === 'register' ? (
              <label>
                Display name
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
              </label>
            ) : null}
            <label>
              Password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                required
                minLength={authMode === 'register' ? 12 : 1}
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button disabled={isLoading} className="primary-button">
              {isLoading ? 'Working...' : authMode === 'register' ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <button className="link-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            {authMode === 'login' ? 'Need an account?' : 'Already have an account?'}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Runlogbook</p>
          <h1>{appMode === 'analytics' ? 'Ask a question' : 'Clarify your latest run'}</h1>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" onClick={() => setAppMode(appMode === 'analytics' ? 'draft' : 'analytics')}>
            {appMode === 'analytics' ? 'Latest run' : 'Ask question'}
          </button>
          <button className="ghost-button" onClick={logout}>Logout</button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {appMode === 'analytics' ? (
        <AnalyticsQueryPanel
          query={analyticsQuery}
          summary={distanceSummary}
          isLoading={isAnalyticsLoading}
          onQueryChange={setAnalyticsQuery}
          onSubmit={submitAnalyticsQuery}
        />
      ) : null}

      {appMode === 'draft' && isLoading && !activeDraft ? <p className="muted">Loading...</p> : null}

      {appMode === 'draft' && !isLoading && !activeDraft ? (
        <section className="empty-card">
          <p className="eyebrow">No draft runs</p>
          <h2>Connect Strava and finish a workout.</h2>
          <p className="muted">When Strava sends a new activity, it will appear here as one focused question at a time.</p>
          <button className="primary-button" onClick={connectStrava} disabled={isLoading}>
            {isLoading ? 'Opening Strava...' : 'Connect Strava'}
          </button>
        </section>
      ) : null}

      {appMode === 'draft' && activeDraft ? (
        <ClarificationCard
          draftRun={activeDraft}
          draftCount={draftRuns.length}
          step={step}
          textValue={textValue}
          clarification={clarification}
          isLoading={isLoading}
          onTextChange={setTextValue}
          onClarificationChange={setClarification}
          onStepChange={(nextStep) => {
            setTextValue('');
            setStep(nextStep);
          }}
          onSave={saveRun}
        />
      ) : null}
    </main>
  );
}

function AnalyticsQueryPanel(props: {
  query: string;
  summary: DistanceSummary | null;
  isLoading: boolean;
  onQueryChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="analytics-card">
      <div>
        <p className="eyebrow">Analytics</p>
        <h2>Задай вопрос</h2>
        <p className="muted">Например: “сколько я пробежал за последние сутки”, “что за 5 дней”, “покажи за неделю”, “с 01.05.2026 по 14.05.2026”.</p>
      </div>
      <form className="query-form" onSubmit={props.onSubmit}>
        <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} />
        <button className="primary-button" disabled={props.isLoading}>
          {props.isLoading ? 'Считаю...' : 'Выполнить'}
        </button>
      </form>

      {props.summary ? (
        <div className="analytics-result">
          <div className="answer-card">
            <span>Ответ</span>
            <strong>{formatAnalyticsAnswer(props.summary)}</strong>
          </div>

          <div className="metric-grid">
            <Metric label="Километраж" value={`${props.summary.totalDistanceKm.toFixed(2)} км`} />
            <Metric label="Тренировок" value={String(props.summary.runCount)} />
            <Metric label="Период" value={`${formatDisplayDate(props.summary.startDate)} - ${formatDisplayDate(props.summary.endDate)}`} />
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Тренировка</th>
                  <th>Км</th>
                  <th>Время</th>
                </tr>
              </thead>
              <tbody>
                {props.summary.runs.length > 0 ? (
                  props.summary.runs.map((run) => (
                    <tr key={run.id}>
                      <td>{formatDisplayDate(run.occurredOn)}</td>
                      <td>{run.title ?? 'Run'}</td>
                      <td>{run.distanceKm.toFixed(2)}</td>
                      <td>{formatDuration(run.durationSeconds)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>За этот период сохраненных тренировок нет.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function formatAnalyticsAnswer(summary: DistanceSummary): string {
  const period = `${formatDisplayDate(summary.startDate)} - ${formatDisplayDate(summary.endDate)}`;
  const runWord = getRunWord(summary.runCount);

  if (summary.runCount === 0) {
    return `За период ${period} сохраненных тренировок нет.`;
  }

  return `За период ${period} ты пробежал ${summary.totalDistanceKm.toFixed(2)} км: ${summary.runCount} ${runWord}.`;
}

function getRunWord(count: number): string {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'тренировок';
  }

  if (lastDigit === 1) {
    return 'тренировка';
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'тренировки';
  }

  return 'тренировок';
}

function ClarificationCard(props: {
  draftRun: DraftRun;
  draftCount: number;
  step: Step;
  textValue: string;
  clarification: Clarification;
  isLoading: boolean;
  onTextChange: (value: string) => void;
  onClarificationChange: (value: Clarification) => void;
  onStepChange: (value: Step) => void;
  onSave: () => void;
}) {
  const context = getWorkoutContext(props.draftRun, props.clarification);
  const currentOutlier = getCurrentWorkoutLapOutlier(props.draftRun, props.clarification);
  const nextStep = getNextStep(props.draftRun, props.step);

  function continueWith(update: Clarification = {}) {
    props.onClarificationChange({ ...props.clarification, ...update });
    props.onStepChange(nextStep);
  }

  function continueWithWorkoutStructure() {
    const workoutStructure = props.textValue.trim();
    const nextClarification = { ...props.clarification, workoutStructure };

    props.onClarificationChange(nextClarification);
    props.onStepChange(getCurrentWorkoutLapOutlier(props.draftRun, nextClarification) ? 'workoutLapReview' : 'effort');
  }

  function continueWithLapCorrection() {
    if (!currentOutlier) {
      props.onStepChange('effort');
      return;
    }

    const nextClarification = {
      ...props.clarification,
      workoutLapCorrections: [
        ...(props.clarification.workoutLapCorrections ?? []),
        { lapNumber: currentOutlier.lapNumber, correctedDistanceMeters: parseMeters(props.textValue) }
      ]
    };

    props.onClarificationChange(nextClarification);
    props.onStepChange(getCurrentWorkoutLapOutlier(props.draftRun, nextClarification) ? 'workoutLapReview' : 'effort');
  }

  return (
    <section className="question-card">
      <div className="context-row">
        <span>{context.title}</span>
        <span>{context.date}</span>
        <span>{context.distance}</span>
        <span>{context.duration}</span>
      </div>
      {props.draftCount > 1 ? <p className="muted">Showing newest draft. {props.draftCount - 1} more waiting.</p> : null}

      {props.step === 'distance' ? (
        <QuestionShell question="What distance should we save?">
          <input
            autoFocus
            inputMode="decimal"
            value={props.textValue}
            onChange={(event) => props.onTextChange(event.target.value)}
            placeholder="5.0 km"
          />
          <button className="primary-button" onClick={() => continueWith({ distanceMeters: parseKm(props.textValue) })}>
            Continue
          </button>
        </QuestionShell>
      ) : null}

      {props.step === 'duration' ? (
        <QuestionShell question="How long did it take?">
          <input
            autoFocus
            value={props.textValue}
            onChange={(event) => props.onTextChange(event.target.value)}
            placeholder="28:30 or 28 min"
          />
          <button className="primary-button" onClick={() => continueWith({ durationSeconds: parseDuration(props.textValue) })}>
            Continue
          </button>
        </QuestionShell>
      ) : null}

      {props.step === 'activityType' ? (
        <QuestionShell question="Was this a run?">
          <div className="choice-row">
            <button className="primary-button" onClick={() => continueWith()}>Yes</button>
            <button className="secondary-button" onClick={() => continueWith({ title: props.draftRun.title ?? 'Run' })}>
              Treat as run
            </button>
          </div>
        </QuestionShell>
      ) : null}

      {props.step === 'workoutKind' ? (
        <QuestionShell question="What kind of workout was it?">
          <div className="choice-row">
            <button className="primary-button" onClick={() => chooseWorkoutKind(props, 'easy')}>Easy run</button>
            <button className="secondary-button" onClick={() => chooseWorkoutKind(props, 'workout')}>Workout</button>
            <button className="secondary-button" onClick={() => chooseWorkoutKind(props, 'long')}>Long run</button>
            <button className="secondary-button" onClick={() => chooseWorkoutKind(props, 'race')}>Race</button>
            <button className="secondary-button" onClick={() => chooseWorkoutKind(props, 'other')}>Other</button>
          </div>
        </QuestionShell>
      ) : null}

      {props.step === 'workoutStructure' ? (
        <QuestionShell question="What workout exactly?">
          <input
            autoFocus
            value={props.textValue}
            onChange={(event) => props.onTextChange(event.target.value)}
            placeholder="10 x 600, 5 x 1000, 12 x 400..."
          />
          <button className="primary-button" onClick={continueWithWorkoutStructure}>
            Continue
          </button>
        </QuestionShell>
      ) : null}

      {props.step === 'workoutLapReview' && currentOutlier ? (
        <QuestionShell question={`Lap ${currentOutlier.lapNumber} looks short. What distance was it?`}>
          <p className="muted">
            Strava says {formatKm(currentOutlier.distanceMeters)} in {formatDuration(currentOutlier.movingTimeSeconds)}. Time stays from Strava.
          </p>
          <input
            autoFocus
            inputMode="decimal"
            value={props.textValue}
            onChange={(event) => props.onTextChange(event.target.value)}
            placeholder="500 m"
          />
          <button
            className="primary-button"
            onClick={continueWithLapCorrection}
          >
            Continue
          </button>
        </QuestionShell>
      ) : null}

      {props.step === 'title' ? (
        <QuestionShell question="What should we call this workout?">
          <input autoFocus value={props.textValue} onChange={(event) => props.onTextChange(event.target.value)} />
          <button className="primary-button" onClick={() => continueWith({ title: props.textValue.trim() })}>
            Continue
          </button>
        </QuestionShell>
      ) : null}

      {props.step === 'effort' ? (
        <QuestionShell question="How hard was it?">
          <div className="effort-grid">
            {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
              <button key={value} onClick={() => continueWith({ perceivedEffort: value })}>
                {value}
              </button>
            ))}
          </div>
        </QuestionShell>
      ) : null}

      {props.step === 'note' ? (
        <QuestionShell question="How did it feel?">
          <textarea
            autoFocus
            value={props.textValue}
            onChange={(event) => props.onTextChange(event.target.value)}
            placeholder="Heavy legs, easy breathing, strong finish..."
          />
          <div className="choice-row">
            <button className="primary-button" onClick={() => continueWith({ notes: props.textValue.trim() || undefined })}>
              Continue
            </button>
            <button className="secondary-button" onClick={() => continueWith({ notes: undefined })}>Skip</button>
          </div>
        </QuestionShell>
      ) : null}

      {props.step === 'summary' ? (
        <QuestionShell question="Save this run?">
          <dl className="summary-list">
            <div><dt>Distance</dt><dd>{context.distance}</dd></div>
            <div><dt>Duration</dt><dd>{context.duration}</dd></div>
            <div><dt>Type</dt><dd>{formatWorkoutKind(props.clarification.workoutKind)}</dd></div>
            {props.clarification.workoutStructure ? <div><dt>Workout</dt><dd>{props.clarification.workoutStructure}</dd></div> : null}
            {props.clarification.workoutLapCorrections?.length ? (
              <div><dt>Lap fixes</dt><dd>{props.clarification.workoutLapCorrections.length}</dd></div>
            ) : null}
            <div><dt>Effort</dt><dd>{props.clarification.perceivedEffort}/10</dd></div>
            <div><dt>Note</dt><dd>{props.clarification.notes || 'Skipped'}</dd></div>
          </dl>
          <button disabled={props.isLoading} className="primary-button" onClick={props.onSave}>
            {props.isLoading ? 'Saving...' : 'Save run'}
          </button>
        </QuestionShell>
      ) : null}
    </section>
  );
}

function chooseWorkoutKind(
  props: {
    clarification: Clarification;
    onClarificationChange: (value: Clarification) => void;
    onStepChange: (value: Step) => void;
  },
  workoutKind: WorkoutKind
) {
  props.onClarificationChange({ ...props.clarification, workoutKind });
  props.onStepChange(workoutKind === 'workout' ? 'workoutStructure' : 'effort');
}

function QuestionShell(props: { question: string; children: React.ReactNode }) {
  return (
    <div className="question-shell">
      <h2>{props.question}</h2>
      {props.children}
    </div>
  );
}

function getFirstStep(draftRun: DraftRun): Step {
  if (draftRun.distanceMeters <= 0) return 'distance';
  if (draftRun.movingTimeSeconds <= 0) return 'duration';
  if (draftRun.activityType && draftRun.activityType !== 'Run') return 'activityType';
  if (!draftRun.title) return 'title';
  return 'workoutKind';
}

function getNextStep(draftRun: DraftRun, currentStep: Step): Step {
  const order: Step[] = [
    'distance',
    'duration',
    'activityType',
    'title',
    'workoutKind',
    'workoutStructure',
    'workoutLapReview',
    'effort',
    'note',
    'summary'
  ];
  const currentIndex = order.indexOf(currentStep);

  for (const step of order.slice(currentIndex + 1)) {
    if (step === 'distance' && draftRun.distanceMeters > 0) continue;
    if (step === 'duration' && draftRun.movingTimeSeconds > 0) continue;
    if (step === 'activityType' && (!draftRun.activityType || draftRun.activityType === 'Run')) continue;
    if (step === 'title' && draftRun.title) continue;
    if (step === 'workoutLapReview') continue;
    return step;
  }

  return 'summary';
}

function formatWorkoutKind(value: WorkoutKind | undefined): string {
  const labels: Record<WorkoutKind, string> = {
    easy: 'Easy run',
    workout: 'Workout',
    long: 'Long run',
    race: 'Race',
    other: 'Other'
  };

  return value ? labels[value] : 'Not set';
}

function getWorkoutContext(draftRun: DraftRun, clarification: Clarification) {
  const distanceMeters = clarification.distanceMeters ?? draftRun.distanceMeters;
  const durationSeconds = clarification.durationSeconds ?? draftRun.movingTimeSeconds;

  return {
    title: clarification.title ?? draftRun.title ?? 'Untitled workout',
    date: formatDisplayDate(draftRun.occurredAt),
    distance: distanceMeters > 0 ? `${(distanceMeters / 1000).toFixed(2)} km` : 'No distance',
    duration: durationSeconds > 0 ? formatDuration(durationSeconds) : 'No duration'
  };
}

function parseKm(value: string): number {
  const normalized = value.replace(',', '.').match(/\d+(\.\d+)?/u)?.[0];

  return normalized ? Math.round(Number(normalized) * 1000) : 0;
}

function parseMeters(value: string): number {
  const normalized = value.replace(',', '.').match(/\d+(\.\d+)?/u)?.[0];

  if (!normalized) {
    return 0;
  }

  const amount = Number(normalized);

  return /км|km/i.test(value) ? Math.round(amount * 1000) : Math.round(amount);
}

function formatKm(distanceMeters: number): string {
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

function getCurrentWorkoutLapOutlier(draftRun: DraftRun, clarification: Clarification) {
  if (clarification.workoutKind !== 'workout' || !clarification.workoutStructure) {
    return null;
  }

  const plannedDistanceMeters = parseIntervalDistanceMeters(clarification.workoutStructure);

  if (!plannedDistanceMeters) {
    return null;
  }

  const correctedLapNumbers = new Set((clarification.workoutLapCorrections ?? []).map((correction) => correction.lapNumber));

  return (draftRun.workoutLaps ?? []).find((lap) => {
    const lowerBound = plannedDistanceMeters * 0.9;
    const upperBound = plannedDistanceMeters * 1.1;

    return lap.lapKind === 'work'
      && !correctedLapNumbers.has(lap.lapNumber)
      && (lap.distanceMeters < lowerBound || lap.distanceMeters > upperBound);
  }) ?? null;
}

function parseIntervalDistanceMeters(value: string): number | null {
  const match = value.toLowerCase().match(/(?:\d+\s*[xх]\s*)?(\d+(?:[.,]\d+)?)\s*(км|km|м|m)?/u);

  if (!match) {
    return null;
  }

  const amount = Number(match[1].replace(',', '.'));
  const unit = match[2] ?? 'м';

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(unit === 'км' || unit === 'km' ? amount * 1000 : amount);
}

function parseDuration(value: string): number {
  const parts = value.trim().split(':').map(Number);

  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return parts[0] * 60 + parts[1];
  }

  const minutes = value.match(/\d+/u)?.[0];

  return minutes ? Number(minutes) * 60 : 0;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function parseAnalyticsPeriod(query: string): { startDate: string; endDate: string } | null {
  const normalized = query.toLowerCase().replace(/ё/g, 'е');
  const explicitDates = normalized.match(/\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}/g);

  if (explicitDates && explicitDates.length >= 2) {
    return { startDate: toApiDate(explicitDates[0]), endDate: toApiDate(explicitDates[1]) };
  }

  const today = new Date();
  const numberMatch = normalized.match(/(?:за|последн(?:ие|их|ий|юю)?)\s+(\d+)\s*(день|дня|дней|сутки|суток|недел[юияь]*)/u);

  if (numberMatch) {
    const amount = Number(numberMatch[1]);
    const unit = numberMatch[2];
    const days = unit.startsWith('недел') ? amount * 7 : amount;

    return getLastDaysPeriod(today, days);
  }

  if (/сут(ки|ок)|24\s*час/.test(normalized)) {
    return getLastDaysPeriod(today, 1);
  }

  if (/недел/.test(normalized)) {
    return getLastDaysPeriod(today, 7);
  }

  if (/месяц/.test(normalized)) {
    return getLastDaysPeriod(today, 30);
  }

  return null;
}

function getLastDaysPeriod(today: Date, days: number): { startDate: string; endDate: string } {
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - Math.max(days - 1, 0));

  return { startDate: toIsoDate(startDate), endDate: toIsoDate(today) };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(value: string): string {
  const datePart = value.slice(0, 10);
  const [year, month, day] = datePart.split('-');

  if (!year || !month || !day) {
    return value;
  }

  return `${day}.${month}.${year}`;
}

function toApiDate(value: string): string {
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
    const [day, month, year] = value.split('.');

    return `${year}-${month}-${day}`;
  }

  return value;
}

function readError(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'Something went wrong';
}
