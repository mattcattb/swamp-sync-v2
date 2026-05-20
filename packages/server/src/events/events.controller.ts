import {zValidator} from "@hono/zod-validator";
import {createRouter} from "../common/hono";
import {
  createEvent,
  createEventSchema,
  deleteEvent,
  eventParamsSchema,
  listEvents,
  updateEvent,
  updateEventSchema,
} from "./events.service";

export const eventsController = createRouter()
  .get("/", async (c) => {
    const events = await listEvents(c.get("userId"));
    return c.json(events);
  })
  .post("/", zValidator("json", createEventSchema), async (c) => {
    const created = await createEvent(c.get("userId"), c.req.valid("json"));
    return c.json(created, 201);
  })
  .patch(
    "/:id",
    zValidator("param", eventParamsSchema),
    zValidator("json", updateEventSchema),
    async (c) => {
      const {id} = c.req.valid("param");
      const updated = await updateEvent(c.get("userId"), id, c.req.valid("json"));
      return c.json(updated);
    },
  )
  .delete("/:id", zValidator("param", eventParamsSchema), async (c) => {
    const {id} = c.req.valid("param");
    await deleteEvent(c.get("userId"), id);
    return c.body(null, 204);
  });
