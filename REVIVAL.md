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

The old repository is attached as the `legacy` remote:

```bash
git remote add legacy https://github.com/mattcattb/Swamp-Sync.git
git fetch legacy
```

Useful old code:

- `wtm-express/src/models/*` for domain shape.
- `wtm-express/src/services/meetingtime.js` for availability matching.
- `wtm-react/src/pages` and `wtm-react/src/components` for old UI flows.

## Current v2 Stack

- Runtime/workspace: Bun workspaces with `packages/server` and `packages/web`.
- Server: Hono, Hono RPC, Better Auth, Drizzle, Postgres, Redis, Bun WebSocket.
- Web: Vite, React, TanStack Router, TanStack Query, Hono RPC client, Better Auth React client, Tailwind/shadcn-style primitives.
- Infra: Docker Compose for Postgres 17 and Redis 7.

## Legacy Product Shape

- Users had profile identity, an icon, owned events, joined meetings, meeting invites, friends, and friend invites.
- Events were personal busy blocks with `title`, optional `description`, `start`, and `end`.
- Meetings had a name, description, selected days, organizers, members, invited users, and a daily time range.
- The main flows were auth, schedule CRUD, meeting creation, joined/invited meeting lists, join/leave/reject/delete meeting actions, profile/friend request management, and meeting details.
- The old matching algorithm collected all member events, merged busy intervals, and returned free intervals inside selected day/time windows.

## v2 Adaptation Notes

- Keep Better Auth as the source of account/session truth. Do not port JWT auth or password handling.
- Move user relationship state out of embedded Mongo arrays and into normalized Postgres tables.
- Prefer Hono RPC response inference on the frontend instead of hand-written DTOs.
- Keep route-local TanStack Query helpers colocated unless they are reused by multiple routes.
- Treat availability matching as pure domain logic that accepts typed event rows and meeting constraints; keep database reads in route/service code.
- Use transactions for multi-row state changes such as creating meetings with members/invites, accepting invites, deleting meetings, and friendship changes.
- Start with personal busy events, not external calendar sync. External calendars can be added later behind the same event model.

## Proposed Postgres Model

- `event`: user-owned busy blocks with title, description, start/end timestamps, optional timezone/source fields later.
- `meeting`: organizer-owned meeting metadata, selected date window/days, daily start/end minutes, duration, status, timestamps.
- `meetingMember`: accepted users for a meeting with role fields such as organizer/member.
- `meetingInvite`: pending/accepted/declined invites for users or email targets.
- `friendship`: one row per pair/request with requester, addressee, status, timestamps.

## Current Cleanup Needed

- Replace the starter `project` table, `projects` API, `ProjectsPanel`, and example landing copy.
- Remove or repurpose the starter `profile` code. It currently references `userProfile`, which does not exist in `db/schema.ts`.
- Update starter tests from projects to Swamp Sync domain behavior.
- Add test env loading/defaults so server tests can run without failing env parsing.
- Rebuild navigation around schedule, meetings, invites, friends/profile, and dashboard.

## Backend Build Order

1. Define Drizzle tables and generate the migration.
2. Add event schemas, service logic, controller routes, and ownership checks.
3. Port availability matching into a small tested helper.
4. Add meeting creation/read/list actions and suggested-time calculation.
5. Add invite accept/reject and meeting leave/delete flows with transactions.
6. Add friendship request/accept/reject/unfriend flows.
7. Add focused tests around matching, ownership, invite state, and transactional edge cases.

## Web Build Order

1. Replace project dashboard with a signed-in Swamp Sync dashboard.
2. Add schedule CRUD with a simple list/form first, then calendar UI.
3. Add meeting creation with selected days/date range, time window, duration, and invite selection.
4. Add meeting detail with members, invite state, and suggested times.
5. Add profile/friends flow using friend code or email search.
6. Improve visual design after the full data flow works.

## New Feature Ideas

- Duration-aware suggestions instead of only raw free intervals.
- Ranking suggested times by least disruption, earliest availability, or preferred hours.
- Meeting comments/notes and decision status after choosing a time.
- Shareable invite links for people who are not friends yet.
- Real-time invite and meeting updates through the existing WebSocket/Redis foundation.
- Availability templates, recurring busy blocks, and weekly working-hour preferences.
- Timezone-aware scheduling for remote groups.
- Calendar import/export later through Google Calendar or ICS.
- Friend codes plus email-based discovery to avoid exposing raw database IDs.
- Audit/activity feed for meeting changes and invite responses.

## First Implementation Pass

1. Rename/remove the example `projects` feature.
2. Add Drizzle tables for `event`, `meeting`, `meetingMember`, `meetingInvite`, and `friendship`.
3. Port `findMeetingTimes` as a small local domain helper with tests.
4. Add Hono routes for events and meetings.
5. Add TanStack Query calls directly in the routes that use them.
6. Keep UI plain and functional until the full flow works.
