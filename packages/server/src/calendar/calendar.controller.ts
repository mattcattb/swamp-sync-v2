import {createRouter} from "../common/hono";
import {getCalendarStatus, syncGoogleCalendar} from "./calendar.service";

export const calendarController = createRouter()
  .get("/status", async (c) => {
    const status = await getCalendarStatus(c.get("userId"));
    return c.json(status);
  })
  .post("/sync", async (c) => {
    const status = await syncGoogleCalendar(c.get("userId"));
    return c.json(status);
  });
