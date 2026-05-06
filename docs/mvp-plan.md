# MVP Plan

## Goal

Build the smallest useful API that imports completed Strava runs, asks runners to clarify workout context, connects runs to a simple training plan, and shows progress.

The MVP should answer one question: does a Strava-triggered clarification workflow help runners keep a more useful training history and make better next-run decisions?

## First Users

- Primary user: the creator testing the workflow personally.
- Early users: friends who run regularly enough to give feedback.
- Admin needs can stay manual at first.

## MVP Scope

### Include

- Proper user authentication for early testers.
- Strava connection for importing completed activities.
- Create draft runs from completed Strava activities.
- Notify users when a Strava activity needs clarification.
- Clarify imported runs with subjective workout fields.
- Store distance, duration, date, perceived effort, notes, and optional route/title.
- Create a simple training plan manually or from pasted text.
- Mark planned workouts as completed, skipped, or changed.
- Basic analytics: weekly distance, run count, longest run, average pace, and plan adherence.

### Defer

- Social feed.
- Public profiles.
- Wearable imports.
- GPS track processing.
- Payments.
- Coaching recommendations.
- Native mobile app.
- Automatic training plan generation.

## Validation Milestones

1. Connect the creator's Strava account and import completed activities.
2. Use Strava-triggered clarification personally for 2 weeks.
3. Invite 3-5 friends and collect feedback on notification timing and clarification friction.
4. Add only the missing features that block repeated weekly use.
5. Decide whether to invest next in web UI, PWA, mobile, deeper analytics, or plan parsing.

## Success Signals

- Users clarify most imported runs after receiving a prompt.
- Users review weekly progress at least once per week.
- The training plan feature changes what users do next.
- Feedback points to workflow improvements rather than missing basic CRUD.
- Users complete Strava-triggered clarification soon after receiving a notification.
