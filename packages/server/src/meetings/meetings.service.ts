import {and, desc, eq, inArray, or} from "drizzle-orm";
import {z} from "zod";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../common/errors";
import {db} from "../db";
import {
  event,
  meeting,
  meetingInvite,
  meetingMember,
  user,
} from "../db/schema";
import {findSuggestedMeetingTimes} from "./availability";

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
      value.durationMinutes <= value.dailyEndMinutes - value.dailyStartMinutes,
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

const assertOrganizer = async (meetingId: string, userId: string) => {
  const [membership] = await db
    .select()
    .from(meetingMember)
    .where(
      and(
        eq(meetingMember.meetingId, meetingId),
        eq(meetingMember.userId, userId),
        eq(meetingMember.role, "organizer"),
      ),
    );

  if (!membership) {
    throw new ForbiddenException("Only organizers can perform this action");
  }
};

const assertCanReadMeeting = async (meetingId: string, userId: string) => {
  const [access] = await db
    .select({meetingId: meeting.id})
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

  if (!access) {
    throw new NotFoundException("Meeting not found");
  }
};

const buildMeetingDetail = async (meetingId: string) => {
  const [foundMeeting] = await db
    .select()
    .from(meeting)
    .where(eq(meeting.id, meetingId));

  if (!foundMeeting) {
    throw new NotFoundException("Meeting not found");
  }

  const members = await db
    .select({
      userId: meetingMember.userId,
      role: meetingMember.role,
      name: user.name,
      email: user.email,
    })
    .from(meetingMember)
    .innerJoin(user, eq(user.id, meetingMember.userId))
    .where(eq(meetingMember.meetingId, meetingId));

  const invites = await db
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
    .where(eq(meetingInvite.meetingId, meetingId));

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
  const uniqueEmails = [...new Set(inviteEmails.map((email) => email.toLowerCase()))];
  for (const email of uniqueEmails) {
    const invitedUser = await getUserByEmail(email);
    if (!invitedUser) {
      throw new BadRequestException(`No registered user found for ${email}`);
    }

    if (invitedUser.id === invitedByUserId) {
      continue;
    }

    const [existingInvite] = await db
      .select()
      .from(meetingInvite)
      .where(
        and(
          eq(meetingInvite.meetingId, meetingId),
          eq(meetingInvite.invitedUserId, invitedUser.id),
        ),
      );

    if (existingInvite) {
      throw new BadRequestException("User is already invited to this meeting");
    }

    await db
      .insert(meetingInvite)
      .values({
        meetingId,
        invitedUserId: invitedUser.id,
        invitedByUserId,
      })
      .onConflictDoNothing({
        target: [meetingInvite.meetingId, meetingInvite.invitedUserId],
      });
  }
};

export const listMeetings = async (userId: string) => {
  const memberships = await db
    .select({
      meeting,
      role: meetingMember.role,
    })
    .from(meetingMember)
    .innerJoin(meeting, eq(meeting.id, meetingMember.meetingId))
    .where(eq(meetingMember.userId, userId))
    .orderBy(desc(meeting.createdAt));

  const pendingInvites = await db
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
    .orderBy(desc(meetingInvite.createdAt));

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

  if (inviteEmails.length > 0) {
    await createInvitesByEmail(createdMeetingId, organizerId, inviteEmails);
  }

  return buildMeetingDetail(createdMeetingId);
};

export const getMeeting = async (meetingId: string, userId: string) => {
  await assertCanReadMeeting(meetingId, userId);
  return buildMeetingDetail(meetingId);
};

export const inviteRegisteredUser = async (
  meetingId: string,
  organizerId: string,
  email: string,
) => {
  await assertOrganizer(meetingId, organizerId);
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

  return buildMeetingDetail(meetingId);
};

export const getMeetingSuggestions = async (
  meetingId: string,
  userId: string,
) => {
  await assertCanReadMeeting(meetingId, userId);

  const detail = await buildMeetingDetail(meetingId);
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

const MINUTES_IN_DAY = 24 * 60;
const availabilityStepMinutes = 30;

const parseDateOnly = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    throw new BadRequestException("Invalid meeting date");
  }
  return new Date(Date.UTC(year, month - 1, day));
};

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * MINUTES_IN_DAY * 60_000);

const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60_000);

const overlaps = (
  left: {startAt: Date; endAt: Date},
  right: {startAt: Date; endAt: Date},
) => left.startAt < right.endAt && left.endAt > right.startAt;

export const getMeetingAvailability = async (
  meetingId: string,
  userId: string,
) => {
  await assertCanReadMeeting(meetingId, userId);

  const detail = await buildMeetingDetail(meetingId);
  const members = detail.members.map((member) => ({
    userId: member.userId,
    name: member.name,
    email: member.email,
    role: member.role,
  }));
  const memberIds = members.map((member) => member.userId);

  if (memberIds.length === 0) {
    return {
      stepMinutes: availabilityStepMinutes,
      members,
      days: [],
    };
  }

  const busyEvents = await db
    .select({
      ownerId: event.ownerId,
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
    })
    .from(event)
    .where(inArray(event.ownerId, memberIds));

  const selectedWeekdays = new Set(detail.selectedWeekdays);
  const startDate = parseDateOnly(detail.startDate);
  const endDate = parseDateOnly(detail.endDate);
  const days = [];

  for (let day = startDate; day <= endDate; day = addDays(day, 1)) {
    if (!selectedWeekdays.has(day.getUTCDay())) {
      continue;
    }

    const slots = [];

    for (
      let minute = detail.dailyStartMinutes;
      minute < detail.dailyEndMinutes;
      minute += availabilityStepMinutes
    ) {
      const slotStart = addMinutes(day, minute);
      const slotEnd = addMinutes(
        day,
        Math.min(minute + availabilityStepMinutes, detail.dailyEndMinutes),
      );

      const busyMembers = members.filter((member) =>
        busyEvents.some(
          (busy) =>
            busy.ownerId === member.userId &&
            overlaps({startAt: slotStart, endAt: slotEnd}, busy),
        ),
      );
      const busyMemberIds = new Set(busyMembers.map((member) => member.userId));
      const availableMembers = members.filter(
        (member) => !busyMemberIds.has(member.userId),
      );

      slots.push({
        startAt: slotStart.toISOString(),
        endAt: slotEnd.toISOString(),
        availableCount: availableMembers.length,
        totalCount: members.length,
        availableMembers,
        busyMembers,
      });
    }

    days.push({
      date: day.toISOString().slice(0, 10),
      slots,
    });
  }

  return {
    stepMinutes: availabilityStepMinutes,
    members,
    days,
  };
};
