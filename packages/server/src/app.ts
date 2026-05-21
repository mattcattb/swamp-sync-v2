import {addErrorHandling} from "./common/errors";
import {addGlobalMiddlewares, createRouter} from "./common/hono";

import {authController} from "./auth/auth.controller";
import {authMiddleware} from "./auth/auth.middleware";
import {eventsController} from "./events/events.controller";
import {meetingsController} from "./meetings/meetings.controller";
import {wsController} from "./ws/ws.controller";

export const api = createRouter()
  .use("*", authMiddleware)
  .route("/events", eventsController)
  .route("/meetings", meetingsController);

const appBase = createRouter();
addGlobalMiddlewares(appBase);
addErrorHandling(appBase);

export const app = appBase
  .route("/api/auth", authController)
  .route("/ws", wsController)
  .route("/api", api);

export type AppType = typeof app;
