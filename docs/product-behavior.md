# Product Behavior

## Core MVP Workflow

The main trigger for entering training data is a completed Strava activity.

1. The runner completes a workout in Strava.
2. Runlogbook receives the completed activity from Strava.
3. Runlogbook imports the objective workout data into a draft run.
4. Runlogbook sends the runner a notification asking them to clarify the workout result.
5. The runner opens the clarification flow and fills in Runlogbook-specific fields.
6. Runlogbook saves the clarified run and uses it for diary, plan progress, and analytics.

Implemented backend flow:

1. Strava webhook stores the activity event.
2. For new activity events, Runlogbook fetches activity details from Strava.
3. Objective fields are saved as an open draft run.
4. Runlogbook creates an in-app notification asking the user to clarify the run.
5. The user can list open draft runs and clarify one into a finalized run.

Manual run creation can exist as a fallback, but it is not the primary MVP behavior.

## Imported From Strava

The Strava import should capture objective facts when available:

- Strava activity id
- Activity type
- Start date and time
- Distance
- Moving time
- Elapsed time
- Average pace or speed
- Activity name
- Strava activity URL

GPS track details should be deferred unless they become necessary for the MVP.

## Clarified By User

After import, the user should add the subjective and planning context that Strava does not reliably provide:

- Perceived effort
- How the workout felt
- Notes
- Whether this matched a planned workout
- Whether the workout was completed as planned, changed, or skipped/replaced
- Optional reason if the workout differed from the plan

If the run matches a planned workout, clarification can link the finalized run to that planned workout and mark it as completed or changed.

Some Strava activities can arrive with zero distance, for example generic `Workout` activities. Draft runs may keep that imported value, but finalized runs require the user to provide a positive distance and duration during clarification.

## Training Plan Behavior

Users should be able to enter a training plan manually or paste a plan they received elsewhere.

The first version should support a simple editable plan rather than automatic plan generation.

Minimum plan fields:

- Plan title
- Start date
- End date if known
- Planned workout date
- Planned workout description
- Optional target distance
- Optional target duration

Later, pasted plans can be parsed into structured workouts, but the MVP can start with manual correction after paste/import.

## Weekly Review

The weekly review should help the runner understand:

- Training volume and regularity
- Pace progress
- Plan adherence
- How workouts felt
- Progress compared with the current plan

Implemented first analytics:

- Weekly run count, distance, duration, longest run, average pace, and average effort.
- Current plan adherence based on planned workouts marked completed or changed.

Natural-language analytics questions are routed through a hybrid intent classifier. The backend first applies deterministic rules for common Russian questions, then falls back to an allowlisted LLM classifier. The LLM never generates SQL; it only selects known analytics intents and parameters. If the question is ambiguous, the product returns 2-3 clarification options.

## Authentication Requirement

The MVP should include proper authentication from the beginning because the app stores personal training data and integrates with Strava accounts.

Authentication does not need enterprise features, but it must separate users correctly and protect Strava tokens.

## Notifications

Notifications are part of the core workflow, not an optional enhancement.

The first notification channel can be email because it is simpler than native push. The architecture should keep notification delivery behind an interface so the channel can later change to Telegram, mobile push, or in-app notifications.

In-app notifications are implemented first. External delivery through email, Telegram, or push should be added through a notification delivery adapter.
