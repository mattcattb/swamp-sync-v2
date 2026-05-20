import {afterAll, beforeEach, describe, expect, test} from "bun:test";
import {createEvent} from "../events/events.service";
import {createTestUser, resetTestDb} from "../test/db";
import {
  acceptInvite,
  createMeeting,
  declineInvite,
  getMeetingSuggestions,
  inviteRegisteredUser,
  joinMeetingByCode,
  listMeetings,
} from "./meetings.service";

const meetingInput = {
  name: "Planning",
  description: "Sprint planning",
  startDate: "2026-06-01",
  endDate: "2026-06-05",
  selectedWeekdays: [1, 2, 3, 4, 5],
  dailyStartMinutes: 9 * 60,
  dailyEndMinutes: 17 * 60,
  durationMinutes: 60,
  inviteEmails: [],
};

describe("meetings", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await resetTestDb();
  });

  test("creates a meeting with organizer membership and join code", async () => {
    const organizer = await createTestUser();
    const created = await createMeeting(organizer.id, meetingInput);

    expect(created.organizerId).toBe(organizer.id);
    expect(created.joinCode).toHaveLength(10);
    expect(created.members).toEqual([
      expect.objectContaining({userId: organizer.id, role: "organizer"}),
    ]);
  });

  test("invites registered users and rejects duplicate invites", async () => {
    const organizer = await createTestUser();
    const invited = await createTestUser();
    const created = await createMeeting(organizer.id, meetingInput);

    const withInvite = await inviteRegisteredUser(
      created.id,
      organizer.id,
      invited.email,
    );

    expect(withInvite.invites).toEqual([
      expect.objectContaining({
        invitedUserId: invited.id,
        status: "pending",
      }),
    ]);

    await expect(
      inviteRegisteredUser(created.id, organizer.id, invited.email),
    ).rejects.toThrow("User is already invited to this meeting");
  });

  test("accepts and declines pending invites", async () => {
    const organizer = await createTestUser();
    const acceptedUser = await createTestUser();
    const declinedUser = await createTestUser();
    const created = await createMeeting(organizer.id, meetingInput);

    const acceptedInvite = await inviteRegisteredUser(
      created.id,
      organizer.id,
      acceptedUser.email,
    );
    const acceptedInviteId = acceptedInvite.invites[0]?.id;
    expect(typeof acceptedInviteId).toBe("string");

    const afterAccept = await acceptInvite(
      created.id,
      acceptedInviteId!,
      acceptedUser.id,
    );
    expect(afterAccept.members).toContainEqual(
      expect.objectContaining({userId: acceptedUser.id, role: "member"}),
    );
    expect(afterAccept.invites).toContainEqual(
      expect.objectContaining({id: acceptedInviteId, status: "accepted"}),
    );

    const declinedInvite = await inviteRegisteredUser(
      created.id,
      organizer.id,
      declinedUser.email,
    );
    const declinedInviteId = declinedInvite.invites.find(
      (invite) => invite.invitedUserId === declinedUser.id,
    )?.id;
    expect(typeof declinedInviteId).toBe("string");

    const afterDecline = await declineInvite(
      created.id,
      declinedInviteId!,
      declinedUser.id,
    );
    expect(afterDecline.members).not.toContainEqual(
      expect.objectContaining({userId: declinedUser.id}),
    );
    expect(afterDecline.invites).toContainEqual(
      expect.objectContaining({id: declinedInviteId, status: "declined"}),
    );
  });

  test("joins by code idempotently", async () => {
    const organizer = await createTestUser();
    const joiningUser = await createTestUser();
    const created = await createMeeting(organizer.id, meetingInput);

    await joinMeetingByCode(created.joinCode, joiningUser.id);
    await joinMeetingByCode(created.joinCode, joiningUser.id);

    const meetings = await listMeetings(joiningUser.id);
    expect(meetings.memberships).toHaveLength(1);
    expect(meetings.memberships[0]?.meeting.id).toBe(created.id);
  });

  test("returns suggestions from accepted member busy events", async () => {
    const organizer = await createTestUser();
    const member = await createTestUser();
    const created = await createMeeting(organizer.id, meetingInput);
    await joinMeetingByCode(created.joinCode, member.id);

    await createEvent(organizer.id, {
      title: "Busy",
      startAt: new Date("2026-06-01T09:00:00.000Z"),
      endAt: new Date("2026-06-01T10:00:00.000Z"),
    });
    await createEvent(member.id, {
      title: "Also busy",
      startAt: new Date("2026-06-01T11:00:00.000Z"),
      endAt: new Date("2026-06-01T12:00:00.000Z"),
    });

    const suggestions = await getMeetingSuggestions(created.id, organizer.id);

    expect(suggestions).toContainEqual({
      startAt: "2026-06-01T10:00:00.000Z",
      endAt: "2026-06-01T11:00:00.000Z",
    });
  });
});
