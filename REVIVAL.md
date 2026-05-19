# Swamp Sync v2 Revival Plan

## Goal

Rebuild the useful parts of Swamp Sync on the matty-stack baseline without carrying over old Express, CRA, MongoDB, or JWT structure.

## 80/20 Milestone

- Keep Better Auth from the baseline for user accounts.
- Replace the example `project` feature with schedules, events, meetings, invites, and friends.
- Port the old availability matching algorithm into TypeScript.
- Store all domain data in Postgres with Drizzle.
- Build the first useful web flow: sign in, add availability/events, create a meeting, view suggested meeting times.
- Deploy the baseline API, web app, Postgres, and Redis to Railway before polishing edge cases.

## Legacy Reference

The old repository should stay attached as the `legacy` remote:

```bash
git remote add legacy https://github.com/mattcattb/Swamp-Sync.git
git fetch legacy
```

Useful old code:

- `wtm-express/src/models/*` for domain shape.
- `wtm-express/src/services/meetingtime.js` for availability matching.
- `wtm-react/src/pages` and `wtm-react/src/components` for old UI flows.

## First Implementation Pass

1. Rename/remove the example `projects` feature.
2. Add Drizzle tables for `event`, `meeting`, `meetingMember`, `meetingInvite`, and `friendship`.
3. Port `findMeetingTimes` as a small local domain helper with tests.
4. Add Hono routes for events and meetings.
5. Add TanStack Query calls directly in the routes that use them.
6. Keep UI plain and functional until the full flow works.
