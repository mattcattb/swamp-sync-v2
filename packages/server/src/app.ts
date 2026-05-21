import {addErrorHandling} from "./common/errors";
import {addGlobalMiddlewares, createRouter} from "./common/hono";

import {authController} from "./auth/auth.controller";
import {authMiddleware} from "./auth/auth.middleware";
import {calendarController} from "./calendar/calendar.controller";
import {eventsController} from "./events/events.controller";
import {
  meetingsController,
  publicMeetingsController,
} from "./meetings/meetings.controller";
import {wsController} from "./ws/ws.controller";

export const api = createRouter()
  .use("*", authMiddleware)
  .route("/calendar", calendarController)
  .route("/events", eventsController)
  .route("/meetings", meetingsController);

export const publicApi = createRouter().route(
  "/meetings",
  publicMeetingsController,
);

const appBase = createRouter();
addGlobalMiddlewares(appBase);
addErrorHandling(appBase);

export const app = appBase
  .route("/api/auth", authController)
  .route("/ws", wsController)
  .route("/api/public", publicApi)
  .route("/api", api);

export type AppType = typeof app;
