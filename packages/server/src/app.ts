import {addErrorHandling} from "./common/errors";
import {addGlobalMiddlewares, createRouter} from "./common/hono";

import {authController} from "./auth/auth.controller";
import {authMiddleware} from "./auth/auth.middleware";
import {eventsController} from "./events/events.controller";
import {meetingsController} from "./meetings/meetings.controller";
import {wsController} from "./ws/ws.controller";

export const app = createRouter();
addGlobalMiddlewares(app);
addErrorHandling(app);

app.route("/api/auth", authController);
app.route("/ws", wsController);

export const api = createRouter()
  .use("*", authMiddleware)
  .route("/events", eventsController)
  .route("/meetings", meetingsController);

app.route("/api", api);

export type AppType = typeof api;
