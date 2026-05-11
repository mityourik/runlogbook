# UI Flow

## Product Principle

The UI should ask one question at a time.

Each step must have a single primary decision or input. The user answers with yes/no, a quick choice, or text. Voice input will be added later through external STT, starting with OpenAI Whisper.

## First MVP Flow

Primary scenario: clarify the newest Strava draft run.

The first UI version does not manage training plan linking. It focuses on converting a Strava-imported draft into a finalized run.

## Entry

After login, the home screen shows the newest open draft run.

If no draft run exists, show an empty state and a `Connect Strava` action.

If multiple draft runs exist, show the newest one first because the user is most likely to remember it.

## Question Order

### 1. Are Corrections Needed?

Only ask correction questions for problematic imported fields.

Problematic fields for MVP:

- `distance_meters = 0`
- `moving_time_seconds = 0`
- activity type is not `Run`
- empty title

If there are no problematic fields, skip directly to effort.

### 2. Correct Problematic Fields

Ask one field per screen.

Examples:

- `What distance should we save?`
- `How long did it take?`
- `What type of workout was this?`
- `What should we call this workout?`

### 3. Effort

Ask: `How hard was it?`

Answer format: buttons `1` through `10`.

### 4. Note

Ask: `How did it feel?`

Answer format: text input with `Skip`.

Voice input is intentionally deferred in the first UI implementation.

### 5. Summary

Show a compact summary:

- Title
- Date
- Distance
- Duration
- Effort
- Note if present

Primary action: `Save run`.

## UI Shape

Use a fullscreen card layout:

- brief workout context at the top;
- one large question;
- one input area;
- one primary action.
