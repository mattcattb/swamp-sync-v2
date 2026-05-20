import {afterAll, beforeEach, describe, expect, test} from "bun:test";
import {createTestUser, resetTestDb} from "../test/db";
import {createEvent, deleteEvent, listEvents, updateEvent} from "./events.service";

describe("events", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await resetTestDb();
  });

  test("creates, lists, updates, and deletes events for the owner", async () => {
    const user = await createTestUser();

    const created = await createEvent(user.id, {
      title: "Busy",
      description: "Class",
      startAt: new Date("2026-06-01T14:00:00.000Z"),
      endAt: new Date("2026-06-01T15:00:00.000Z"),
    });

    expect(await listEvents(user.id)).toHaveLength(1);

    const updated = await updateEvent(user.id, created.id, {
      title: "Very busy",
    });
    expect(updated.title).toBe("Very busy");

    await deleteEvent(user.id, created.id);
    expect(await listEvents(user.id)).toEqual([]);
  });

  test("does not expose another user's events", async () => {
    const owner = await createTestUser();
    const otherUser = await createTestUser();

    await createEvent(owner.id, {
      title: "Private",
      startAt: new Date("2026-06-01T14:00:00.000Z"),
      endAt: new Date("2026-06-01T15:00:00.000Z"),
    });

    expect(await listEvents(otherUser.id)).toEqual([]);
  });
});
