import { useEffect, useState } from 'react';
import {
  clarifyDraftRun,
  getStravaConnectUrl,
  listDraftRuns,
  login,
  register,
  type DraftRun
} from './api.js';

type AuthMode = 'login' | 'register';
type Step = 'distance' | 'duration' | 'type' | 'title' | 'effort' | 'note' | 'summary';

type Clarification = {
  occurredOn?: string;
  distanceMeters?: number;
  durationSeconds?: number;
  title?: string;
  perceivedEffort?: number;
  notes?: string;
};

const tokenStorageKey = 'runlogbook.token';

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem(tokenStorageKey));
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [draftRuns, setDraftRuns] = useState<DraftRun[]>([]);
  const [activeDraft, setActiveDraft] = useState<DraftRun | null>(null);
  const [clarification, setClarification] = useState<Clarification>({});
  const [step, setStep] = useState<Step>('effort');
  const [textValue, setTextValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
    if (!token || !activeDraft || !clarification.perceivedEffort) {
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
          <h1>Clarify your latest run</h1>
        </div>
        <button className="ghost-button" onClick={logout}>Logout</button>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {isLoading && !activeDraft ? <p className="muted">Loading...</p> : null}

      {!isLoading && !activeDraft ? (
        <section className="empty-card">
          <p className="eyebrow">No draft runs</p>
          <h2>Connect Strava and finish a workout.</h2>
          <p className="muted">When Strava sends a new activity, it will appear here as one focused question at a time.</p>
          <button className="primary-button" onClick={connectStrava} disabled={isLoading}>
            {isLoading ? 'Opening Strava...' : 'Connect Strava'}
          </button>
        </section>
      ) : null}

      {activeDraft ? (
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
  const nextStep = getNextStep(props.draftRun, props.step);

  function continueWith(update: Clarification = {}) {
    props.onClarificationChange({ ...props.clarification, ...update });
    props.onStepChange(nextStep);
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

      {props.step === 'type' ? (
        <QuestionShell question="Was this a run?">
          <div className="choice-row">
            <button className="primary-button" onClick={() => continueWith()}>Yes</button>
            <button className="secondary-button" onClick={() => continueWith({ title: props.draftRun.title ?? 'Run' })}>
              Treat as run
            </button>
          </div>
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
  if (draftRun.activityType && draftRun.activityType !== 'Run') return 'type';
  if (!draftRun.title) return 'title';
  return 'effort';
}

function getNextStep(draftRun: DraftRun, currentStep: Step): Step {
  const order: Step[] = ['distance', 'duration', 'type', 'title', 'effort', 'note', 'summary'];
  const currentIndex = order.indexOf(currentStep);

  for (const step of order.slice(currentIndex + 1)) {
    if (step === 'distance' && draftRun.distanceMeters > 0) continue;
    if (step === 'duration' && draftRun.movingTimeSeconds > 0) continue;
    if (step === 'type' && (!draftRun.activityType || draftRun.activityType === 'Run')) continue;
    if (step === 'title' && draftRun.title) continue;
    return step;
  }

  return 'summary';
}

function getWorkoutContext(draftRun: DraftRun, clarification: Clarification) {
  const distanceMeters = clarification.distanceMeters ?? draftRun.distanceMeters;
  const durationSeconds = clarification.durationSeconds ?? draftRun.movingTimeSeconds;

  return {
    title: clarification.title ?? draftRun.title ?? 'Untitled workout',
    date: new Date(draftRun.occurredAt).toLocaleDateString(),
    distance: distanceMeters > 0 ? `${(distanceMeters / 1000).toFixed(2)} km` : 'No distance',
    duration: durationSeconds > 0 ? formatDuration(durationSeconds) : 'No duration'
  };
}

function parseKm(value: string): number {
  const normalized = value.replace(',', '.').match(/\d+(\.\d+)?/u)?.[0];

  return normalized ? Math.round(Number(normalized) * 1000) : 0;
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

function readError(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'Something went wrong';
}
