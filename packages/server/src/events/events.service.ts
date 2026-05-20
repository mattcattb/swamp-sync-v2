import {and, desc, eq} from "drizzle-orm";
import {z} from "zod";
import {BadRequestException, NotFoundException} from "../common/errors";
import {db} from "../db";
import {event} from "../db/schema";

const isoDateSchema = z
  .string()
  .datetime()
  .transform((value) => new Date(value));

const eventInputSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(1000).optional().nullable(),
  startAt: isoDateSchema,
  endAt: isoDateSchema,
});

export const createEventSchema = eventInputSchema.refine(
  (value) => value.startAt < value.endAt,
  {
    message: "Event start must be before event end",
    path: ["endAt"],
  },
);

export const updateEventSchema = eventInputSchema.partial().refine(
  (value) => {
    if (value.startAt && value.endAt) {
      return value.startAt < value.endAt;
    }
    return true;
  },
  {
    message: "Event start must be before event end",
    path: ["endAt"],
  },
);

export const eventParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listEvents = (ownerId: string) =>
  db
    .select()
    .from(event)
    .where(eq(event.ownerId, ownerId))
    .orderBy(desc(event.startAt));

export const createEvent = async (
  ownerId: string,
  input: z.infer<typeof createEventSchema>,
) => {
  const [created] = await db
    .insert(event)
    .values({
      ownerId,
      title: input.title,
      description: input.description,
      startAt: input.startAt,
      endAt: input.endAt,
    })
    .returning();

  return created;
};

export const updateEvent = async (
  ownerId: string,
  eventId: string,
  input: z.infer<typeof updateEventSchema>,
) => {
  if (input.startAt || input.endAt) {
    const [existing] = await db
      .select()
      .from(event)
      .where(and(eq(event.id, eventId), eq(event.ownerId, ownerId)));

    if (!existing) {
      throw new NotFoundException("Event not found");
    }

    const nextStartAt = input.startAt ?? existing.startAt;
    const nextEndAt = input.endAt ?? existing.endAt;

    if (nextStartAt >= nextEndAt) {
      throw new BadRequestException("Event start must be before event end");
    }
  }

  const [updated] = await db
    .update(event)
    .set({...input, updatedAt: new Date()})
    .where(and(eq(event.id, eventId), eq(event.ownerId, ownerId)))
    .returning();

  if (!updated) {
    throw new NotFoundException("Event not found");
  }

  return updated;
};

export const deleteEvent = async (ownerId: string, eventId: string) => {
  const [deleted] = await db
    .delete(event)
    .where(and(eq(event.id, eventId), eq(event.ownerId, ownerId)))
    .returning();

  if (!deleted) {
    throw new NotFoundException("Event not found");
  }

  return deleted;
};
