import {and, eq} from "drizzle-orm";
import {createHash, randomUUID} from "node:crypto";
import {z} from "zod";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../common/errors";
import {db} from "../db";
import {meeting, meetingParticipant, user} from "../db/schema";

export const guestJoinSchema = z.object({
  displayName: z.string().min(1).max(120),
});

const hashGuestToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const createGuestToken = () => randomUUID() + randomUUID();

const getUserById = async (userId: string) => {
  const [found] = await db.select().from(user).where(eq(user.id, userId));
  return found;
};

export const getOrCreateRegisteredParticipant = async (
  meetingId: string,
  userId: string,
) => {
  const [existing] = await db
    .select()
    .from(meetingParticipant)
    .where(
      and(
        eq(meetingParticipant.meetingId, meetingId),
        eq(meetingParticipant.userId, userId),
      ),
    );

  if (existing) {
    return existing;
  }

  const foundUser = await getUserById(userId);
  if (!foundUser) {
    throw new NotFoundException("User not found");
  }

  const [created] = await db
    .insert(meetingParticipant)
    .values({
      meetingId,
      userId,
      kind: "registered",
      displayName: foundUser.name,
      email: foundUser.email,
    })
    .onConflictDoNothing({
      target: [meetingParticipant.meetingId, meetingParticipant.userId],
    })
    .returning();

  if (created) {
    return created;
  }

  const [afterConflict] = await db
    .select()
    .from(meetingParticipant)
    .where(
      and(
        eq(meetingParticipant.meetingId, meetingId),
        eq(meetingParticipant.userId, userId),
      ),
    );

  if (!afterConflict) {
    throw new BadRequestException("Could not create participant");
  }

  return afterConflict;
};

export const createGuestParticipant = async (
  meetingId: string,
  displayName: string,
) => {
  const token = createGuestToken();
  const [participant] = await db
    .insert(meetingParticipant)
    .values({
      meetingId,
      kind: "guest",
      displayName,
      guestTokenHash: hashGuestToken(token),
    })
    .returning();

  if (!participant) {
    throw new BadRequestException("Could not join meeting");
  }

  return {participant, token};
};

export const getParticipantsForMeeting = async (meetingId: string) =>
  db
    .select({
      id: meetingParticipant.id,
      userId: meetingParticipant.userId,
      kind: meetingParticipant.kind,
      displayName: meetingParticipant.displayName,
      email: meetingParticipant.email,
      guestTokenHash: meetingParticipant.guestTokenHash,
    })
    .from(meetingParticipant)
    .where(eq(meetingParticipant.meetingId, meetingId));

export const resolveCurrentParticipant = (
  participants: Awaited<ReturnType<typeof getParticipantsForMeeting>>,
  userId?: string,
  guestToken?: string | null,
) => {
  if (userId) {
    return participants.find((participant) => participant.userId === userId);
  }

  if (!guestToken) {
    return undefined;
  }

  const tokenHash = hashGuestToken(guestToken);
  return participants.find(
    (participant) =>
      participant.kind === "guest" && participant.guestTokenHash === tokenHash,
  );
};

export const getParticipantForWrite = async (
  meetingId: string,
  userId?: string,
  guestToken?: string | null,
) => {
  if (userId) {
    return getOrCreateRegisteredParticipant(meetingId, userId);
  }

  const currentParticipant = resolveCurrentParticipant(
    await getParticipantsForMeeting(meetingId),
    undefined,
    guestToken,
  );

  if (!currentParticipant) {
    throw new ForbiddenException(
      "Join this meeting before saving availability",
    );
  }

  return currentParticipant;
};

export const stripParticipantSecrets = (
  participants: Awaited<ReturnType<typeof getParticipantsForMeeting>>,
) =>
  participants.map(({guestTokenHash: _guestTokenHash, ...participant}) => participant);

export const getPublicMeeting = async (
  meetingId: string,
  userId?: string,
  guestToken?: string | null,
) => {
  const [foundMeeting, participants] = await Promise.all([
    db
      .select({
        id: meeting.id,
        name: meeting.name,
        description: meeting.description,
        startDate: meeting.startDate,
        endDate: meeting.endDate,
        selectedWeekdays: meeting.selectedWeekdays,
        dailyStartMinutes: meeting.dailyStartMinutes,
        dailyEndMinutes: meeting.dailyEndMinutes,
        durationMinutes: meeting.durationMinutes,
        joinCode: meeting.joinCode,
      })
      .from(meeting)
      .where(eq(meeting.id, meetingId))
      .then(([row]) => row),
    getParticipantsForMeeting(meetingId),
  ]);

  if (!foundMeeting) {
    throw new NotFoundException("Meeting not found");
  }

  const currentParticipant = resolveCurrentParticipant(
    participants,
    userId,
    guestToken,
  );

  return {
    ...foundMeeting,
    participants: stripParticipantSecrets(participants),
    currentParticipantId: currentParticipant?.id ?? null,
    currentParticipantKind: currentParticipant?.kind ?? null,
  };
};
