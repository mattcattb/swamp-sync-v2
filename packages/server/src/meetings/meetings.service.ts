import {and, desc, eq, inArray, or} from "drizzle-orm";
import {z} from "zod";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../common/errors";
import {db} from "../db";
import {event, meeting, meetingInvite, meetingMember, user} from "../db/schema";
import {findSuggestedMeetingTimes} from "./availability";
import {getOrCreateRegisteredParticipant} from "./participants.service";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const meetingInputSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(1000).optional().nullable(),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  selectedWeekdays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  dailyStartMinutes: z.number().int().min(0).max(1439),
  dailyEndMinutes: z.number().int().min(1).max(1440),
  durationMinutes: z.number().int().min(1).max(1440),
});

const validateMeetingWindow = <T extends z.infer<typeof meetingInputSchema>>(
  schema: z.ZodType<T>,
) =>
  schema
    .refine((value) => value.startDate <= value.endDate, {
      message: "Meeting start date must be before or equal to end date",
      path: ["endDate"],
    })
    .refine((value) => value.dailyStartMinutes < value.dailyEndMinutes, {
      message: "Daily start time must be before daily end time",
      path: ["dailyEndMinutes"],
    })
    .refine(
      (value) =>
        value.durationMinutes <=
        value.dailyEndMinutes - value.dailyStartMinutes,
      {
        message: "Duration must fit inside the daily meeting window",
        path: ["durationMinutes"],
      },
    );

export const createMeetingSchema = validateMeetingWindow(
  meetingInputSchema.extend({
    inviteEmails: z.array(z.string().email()).max(20).optional().default([]),
  }),
);

export const meetingParamsSchema = z.object({
  id: z.string().uuid(),
});

export const inviteParamsSchema = z.object({
  id: z.string().uuid(),
  inviteId: z.string().uuid(),
});

export const inviteByEmailSchema = z.object({
  email: z.string().email(),
});

export const joinCodeParamsSchema = z.object({
  joinCode: z.string().min(4).max(32),
});

const generateJoinCode = () =>
  crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();

const getUserByEmail = async (email: string) => {
  const [found] = await db
    .select()
    .from(user)
    .where(eq(user.email, email.toLowerCase()));
  return found;
};

const getMeetingRow = async (meetingId: string, userId?: string) => {
  if (!userId) {
    const [foundMeeting] = await db
      .select()
      .from(meeting)
      .where(eq(meeting.id, meetingId));

    return foundMeeting;
  }

  const [row] = await db
    .select({meeting})
    .from(meeting)
    .leftJoin(
      meetingMember,
      and(
        eq(meetingMember.meetingId, meeting.id),
        eq(meetingMember.userId, userId),
      ),
    )
    .leftJoin(
      meetingInvite,
      and(
        eq(meetingInvite.meetingId, meeting.id),
        eq(meetingInvite.invitedUserId, userId),
        eq(meetingInvite.status, "pending"),
      ),
    )
    .where(
      and(
        eq(meeting.id, meetingId),
        or(
          eq(meeting.organizerId, userId),
          eq(meetingMember.userId, userId),
          eq(meetingInvite.invitedUserId, userId),
        ),
      ),
    );

  return row?.meeting;
};

const getOrganizerMeetingRow = async (meetingId: string, userId: string) => {
  const [row] = await db
    .select({meeting})
    .from(meeting)
    .innerJoin(
      meetingMember,
      and(
        eq(meetingMember.meetingId, meeting.id),
        eq(meetingMember.userId, userId),
        eq(meetingMember.role, "organizer"),
      ),
    )
    .where(eq(meeting.id, meetingId));

  return row?.meeting;
};

export const getMeetingWindow = async (meetingId: string, userId?: string) => {
  const foundMeeting = await getMeetingRow(meetingId, userId);
  if (!foundMeeting) {
    throw new NotFoundException("Meeting not found");
  }

  return {
    id: foundMeeting.id,
    name: foundMeeting.name,
    startDate: foundMeeting.startDate,
    endDate: foundMeeting.endDate,
    selectedWeekdays: foundMeeting.selectedWeekdays,
    dailyStartMinutes: foundMeeting.dailyStartMinutes,
    dailyEndMinutes: foundMeeting.dailyEndMinutes,
    durationMinutes: foundMeeting.durationMinutes,
  };
};

const buildMeetingDetail = async (meetingId: string, userId?: string) => {
  const foundMeeting = await getMeetingRow(meetingId, userId);

  if (!foundMeeting) {
    throw new NotFoundException("Meeting not found");
  }

  const [members, invites] = await Promise.all([
    db
      .select({
        userId: meetingMember.userId,
        role: meetingMember.role,
        name: user.name,
        email: user.email,
      })
      .from(meetingMember)
      .innerJoin(user, eq(user.id, meetingMember.userId))
      .where(eq(meetingMember.meetingId, meetingId)),
    db
      .select({
        id: meetingInvite.id,
        status: meetingInvite.status,
        invitedUserId: meetingInvite.invitedUserId,
        name: user.name,
        email: user.email,
        createdAt: meetingInvite.createdAt,
      })
      .from(meetingInvite)
      .innerJoin(user, eq(user.id, meetingInvite.invitedUserId))
      .where(eq(meetingInvite.meetingId, meetingId)),
  ]);

  return {
    ...foundMeeting,
    members,
    invites,
  };
};

const createInvitesByEmail = async (
  meetingId: string,
  invitedByUserId: string,
  inviteEmails: string[],
) => {
  const uniqueEmails = [
    ...new Set(inviteEmails.map((email) => email.toLowerCase())),
  ];

  for (const email of uniqueEmails) {
    const invitedUser = await getUserByEmail(email);
    if (!invitedUser) {
      throw new BadRequestException(`No registered user found for ${email}`);
    }

    if (invitedUser.id === invitedByUserId) {
      continue;
    }

    const [created] = await db
      .insert(meetingInvite)
      .values({
        meetingId,
        invitedUserId: invitedUser.id,
        invitedByUserId,
      })
      .onConflictDoNothing({
        target: [meetingInvite.meetingId, meetingInvite.invitedUserId],
      })
      .returning();

    if (!created) {
      throw new BadRequestException("User is already invited to this meeting");
    }
  }
};

export const listMeetings = async (userId: string) => {
  const [memberships, pendingInvites] = await Promise.all([
    db
      .select({
        meeting,
        role: meetingMember.role,
      })
      .from(meetingMember)
      .innerJoin(meeting, eq(meeting.id, meetingMember.meetingId))
      .where(eq(meetingMember.userId, userId))
      .orderBy(desc(meeting.createdAt)),
    db
      .select({
        inviteId: meetingInvite.id,
        meeting,
        invitedByUserId: meetingInvite.invitedByUserId,
        createdAt: meetingInvite.createdAt,
      })
      .from(meetingInvite)
      .innerJoin(meeting, eq(meeting.id, meetingInvite.meetingId))
      .where(
        and(
          eq(meetingInvite.invitedUserId, userId),
          eq(meetingInvite.status, "pending"),
        ),
      )
      .orderBy(desc(meetingInvite.createdAt)),
  ]);

  return {
    memberships,
    pendingInvites,
  };
};

export const createMeeting = async (
  organizerId: string,
  input: z.infer<typeof createMeetingSchema>,
) => {
  let createdMeetingId = "";
  const inviteEmails = input.inviteEmails ?? [];

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(meeting)
      .values({
        organizerId,
        name: input.name,
        description: input.description,
        startDate: input.startDate,
        endDate: input.endDate,
        selectedWeekdays: input.selectedWeekdays,
        dailyStartMinutes: input.dailyStartMinutes,
        dailyEndMinutes: input.dailyEndMinutes,
        durationMinutes: input.durationMinutes,
        joinCode: generateJoinCode(),
      })
      .returning();

    if (!created) {
      throw new BadRequestException("Failed to create meeting");
    }

    createdMeetingId = created.id;

    await tx.insert(meetingMember).values({
      meetingId: created.id,
      userId: organizerId,
      role: "organizer",
    });
  });

  await getOrCreateRegisteredParticipant(createdMeetingId, organizerId);

  if (inviteEmails.length > 0) {
    await createInvitesByEmail(createdMeetingId, organizerId, inviteEmails);
  }

  return buildMeetingDetail(createdMeetingId);
};

export const getMeeting = async (meetingId: string, userId: string) => {
  return buildMeetingDetail(meetingId, userId);
};

export const inviteRegisteredUser = async (
  meetingId: string,
  organizerId: string,
  email: string,
) => {
  const organizerMeeting = await getOrganizerMeetingRow(meetingId, organizerId);
  if (!organizerMeeting) {
    throw new ForbiddenException("Only organizers can perform this action");
  }

  await createInvitesByEmail(meetingId, organizerId, [email]);
  return buildMeetingDetail(meetingId);
};

export const acceptInvite = async (
  meetingId: string,
  inviteId: string,
  userId: string,
) => {
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(meetingInvite)
      .set({status: "accepted", updatedAt: new Date()})
      .where(
        and(
          eq(meetingInvite.id, inviteId),
          eq(meetingInvite.meetingId, meetingId),
          eq(meetingInvite.invitedUserId, userId),
          eq(meetingInvite.status, "pending"),
        ),
      )
      .returning();

    if (!updated) {
      throw new NotFoundException("Pending invite not found");
    }

    await tx
      .insert(meetingMember)
      .values({
        meetingId,
        userId,
        role: "member",
      })
      .onConflictDoNothing({
        target: [meetingMember.meetingId, meetingMember.userId],
      });
  });

  await getOrCreateRegisteredParticipant(meetingId, userId);

  return buildMeetingDetail(meetingId);
};

export const declineInvite = async (
  meetingId: string,
  inviteId: string,
  userId: string,
) => {
  const [updated] = await db
    .update(meetingInvite)
    .set({status: "declined", updatedAt: new Date()})
    .where(
      and(
        eq(meetingInvite.id, inviteId),
        eq(meetingInvite.meetingId, meetingId),
        eq(meetingInvite.invitedUserId, userId),
        eq(meetingInvite.status, "pending"),
      ),
    )
    .returning();

  if (!updated) {
    throw new NotFoundException("Pending invite not found");
  }

  return buildMeetingDetail(meetingId);
};

export const joinMeetingByCode = async (joinCode: string, userId: string) => {
  let meetingId = "";

  await db.transaction(async (tx) => {
    const [foundMeeting] = await tx
      .select()
      .from(meeting)
      .where(eq(meeting.joinCode, joinCode.toUpperCase()));

    if (!foundMeeting) {
      throw new NotFoundException("Meeting not found");
    }

    meetingId = foundMeeting.id;

    await tx
      .insert(meetingMember)
      .values({
        meetingId: foundMeeting.id,
        userId,
        role: "member",
      })
      .onConflictDoNothing({
        target: [meetingMember.meetingId, meetingMember.userId],
      });

    await tx
      .update(meetingInvite)
      .set({status: "accepted", updatedAt: new Date()})
      .where(
        and(
          eq(meetingInvite.meetingId, foundMeeting.id),
          eq(meetingInvite.invitedUserId, userId),
          eq(meetingInvite.status, "pending"),
        ),
      );
  });

  await getOrCreateRegisteredParticipant(meetingId, userId);

  return buildMeetingDetail(meetingId);
};

export const getMeetingSuggestions = async (
  meetingId: string,
  userId: string,
) => {
  const detail = await buildMeetingDetail(meetingId, userId);
  const memberIds = detail.members.map((member) => member.userId);

  if (memberIds.length === 0) {
    return [];
  }

  const busyEvents = await db
    .select({
      startAt: event.startAt,
      endAt: event.endAt,
    })
    .from(event)
    .where(inArray(event.ownerId, memberIds));

  return findSuggestedMeetingTimes(
    {
      startDate: detail.startDate,
      endDate: detail.endDate,
      selectedWeekdays: detail.selectedWeekdays,
      dailyStartMinutes: detail.dailyStartMinutes,
      dailyEndMinutes: detail.dailyEndMinutes,
      durationMinutes: detail.durationMinutes,
    },
    busyEvents,
  );
};
