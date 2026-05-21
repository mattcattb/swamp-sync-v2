import {inArray} from "drizzle-orm";
import {z} from "zod";
import {BadRequestException} from "../common/errors";
import {db} from "../db";
import {
  calendarBusyBlock,
  event,
  meetingAvailabilitySlot,
} from "../db/schema";
import {getMeetingWindow} from "./meetings.service";
import {
  getParticipantForWrite,
  getParticipantsForMeeting,
  resolveCurrentParticipant,
  stripParticipantSecrets,
} from "./participants.service";

const isoDateSchema = z
  .string()
  .datetime()
  .transform((value) => new Date(value));

export const saveAvailabilitySchema = z.object({
  slots: z
    .array(
      z.object({
        startAt: isoDateSchema,
        endAt: isoDateSchema,
      }),
    )
    .max(500),
});

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

export const saveParticipantAvailability = async (
  meetingId: string,
  input: z.infer<typeof saveAvailabilitySchema>,
  userId?: string,
  guestToken?: string | null,
) => {
  const participant = await getParticipantForWrite(
    meetingId,
    userId,
    guestToken,
  );
  const slots = input.slots.filter((slot) => slot.startAt < slot.endAt);

  await db.transaction(async (tx) => {
    await tx
      .delete(meetingAvailabilitySlot)
      .where(inArray(meetingAvailabilitySlot.participantId, [participant.id]));

    if (slots.length > 0) {
      await tx.insert(meetingAvailabilitySlot).values(
        slots.map((slot) => ({
          meetingId,
          participantId: participant.id,
          startAt: slot.startAt,
          endAt: slot.endAt,
        })),
      );
    }
  });

  return getMeetingAvailabilityGrid(meetingId, userId, guestToken);
};

export const getMeetingAvailabilityGrid = async (
  meetingId: string,
  userId?: string,
  guestToken?: string | null,
) => {
  const [detail, participantsWithSecrets] = await Promise.all([
    getMeetingWindow(meetingId),
    getParticipantsForMeeting(meetingId),
  ]);
  const currentParticipant = resolveCurrentParticipant(
    participantsWithSecrets,
    userId,
    guestToken,
  );
  const participants = stripParticipantSecrets(participantsWithSecrets);
  const participantIds = participants.map((participant) => participant.id);
  const memberIds = participants
    .map((participant) => participant.userId)
    .filter((id): id is string => Boolean(id));

  if (participants.length === 0) {
    return {
      stepMinutes: availabilityStepMinutes,
      members: [],
      participants,
      currentParticipantId: currentParticipant?.id ?? null,
      currentParticipantAvailability: [],
      days: [],
    };
  }

  const [availabilitySlots, busyEvents, importedBusyBlocks] = await Promise.all([
    participantIds.length > 0
      ? db
          .select()
          .from(meetingAvailabilitySlot)
          .where(inArray(meetingAvailabilitySlot.participantId, participantIds))
      : [],
    memberIds.length > 0
      ? db
          .select({
            userId: event.ownerId,
            startAt: event.startAt,
            endAt: event.endAt,
          })
          .from(event)
          .where(inArray(event.ownerId, memberIds))
      : [],
    memberIds.length > 0
      ? db
          .select({
            userId: calendarBusyBlock.userId,
            startAt: calendarBusyBlock.startAt,
            endAt: calendarBusyBlock.endAt,
          })
          .from(calendarBusyBlock)
          .where(inArray(calendarBusyBlock.userId, memberIds))
      : [],
  ]);
  const busyIntervals = [...busyEvents, ...importedBusyBlocks];
  const currentParticipantAvailability = availabilitySlots
    .filter((slot) => slot.participantId === currentParticipant?.id)
    .map((slot) => ({
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString(),
    }));

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
      const slotWindow = {startAt: slotStart, endAt: slotEnd};
      const busyParticipants = participants.filter((participant) =>
        participant.userId
          ? busyIntervals.some(
              (busy) =>
                busy.userId === participant.userId && overlaps(slotWindow, busy),
            )
          : false,
      );
      const busyParticipantIds = new Set(
        busyParticipants.map((participant) => participant.id),
      );
      const availableParticipants = participants.filter((participant) => {
        if (busyParticipantIds.has(participant.id)) {
          return false;
        }

        return availabilitySlots.some(
          (availableSlot) =>
            availableSlot.participantId === participant.id &&
            availableSlot.startAt.getTime() === slotStart.getTime() &&
            availableSlot.endAt.getTime() === slotEnd.getTime(),
        );
      });
      const availableParticipantIds = new Set(
        availableParticipants.map((participant) => participant.id),
      );
      const notAvailableParticipants = participants.filter(
        (participant) =>
          !availableParticipantIds.has(participant.id) &&
          !busyParticipantIds.has(participant.id),
      );

      slots.push({
        startAt: slotStart.toISOString(),
        endAt: slotEnd.toISOString(),
        availableCount: availableParticipants.length,
        totalCount: participants.length,
        availableMembers: availableParticipants.map((participant) => ({
          userId: participant.userId ?? participant.id,
          name: participant.displayName,
          email: participant.email,
          role: participant.kind,
        })),
        busyMembers: busyParticipants.map((participant) => ({
          userId: participant.userId ?? participant.id,
          name: participant.displayName,
          email: participant.email,
          role: participant.kind,
        })),
        notAvailableMembers: notAvailableParticipants.map((participant) => ({
          userId: participant.userId ?? participant.id,
          name: participant.displayName,
          email: participant.email,
          role: participant.kind,
        })),
      });
    }

    days.push({
      date: day.toISOString().slice(0, 10),
      slots,
    });
  }

  return {
    stepMinutes: availabilityStepMinutes,
    members: participants.map((participant) => ({
      userId: participant.userId ?? participant.id,
      name: participant.displayName,
      email: participant.email,
      role: participant.kind,
    })),
    participants,
    currentParticipantId: currentParticipant?.id ?? null,
    currentParticipantAvailability,
    days,
  };
};

export const getMeetingAvailability = async (
  meetingId: string,
  userId: string,
) => {
  await getMeetingWindow(meetingId, userId);
  return getMeetingAvailabilityGrid(meetingId, userId);
};
