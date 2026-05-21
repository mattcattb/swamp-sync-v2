import {and, eq} from "drizzle-orm";
import {BadRequestException} from "../common/errors";
import {db} from "../db";
import {account, calendarBusyBlock, calendarConnection} from "../db/schema";
import {auth} from "../lib/auth";
import {queryGoogleFreeBusy} from "../lib/gcalender";

const googleProvider = "google";
const primaryCalendarId = "primary";

const upsertGoogleConnection = async (
  userId: string,
  values: {
    status: "connected" | "needs_auth" | "syncing" | "error";
    lastSyncedAt?: Date | null;
    syncError?: string | null;
  },
) => {
  const [connection] = await db
    .insert(calendarConnection)
    .values({
      userId,
      provider: googleProvider,
      status: values.status,
      lastSyncedAt: values.lastSyncedAt,
      syncError: values.syncError,
    })
    .onConflictDoUpdate({
      target: [calendarConnection.userId, calendarConnection.provider],
      set: {
        status: values.status,
        lastSyncedAt: values.lastSyncedAt,
        syncError: values.syncError,
        updatedAt: new Date(),
      },
    })
    .returning();

  return connection;
};

export const getCalendarStatus = async (userId: string) => {
  const [googleAccount] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, googleProvider)));

  const [connection] = await db
    .select()
    .from(calendarConnection)
    .where(
      and(
        eq(calendarConnection.userId, userId),
        eq(calendarConnection.provider, googleProvider),
      ),
    );

  return {
    provider: googleProvider,
    connected: Boolean(googleAccount?.accessToken),
    canSync: Boolean(googleAccount?.accessToken),
    status:
      connection?.status ?? (googleAccount?.accessToken ? "connected" : "needs_auth"),
    lastSyncedAt: connection?.lastSyncedAt ?? null,
    syncError: connection?.syncError ?? null,
    scope: googleAccount?.scope ?? null,
  };
};

export const syncGoogleCalendar = async (userId: string) => {
  const googleAccount = await auth.api.getAccessToken({
    body: {providerId: "google", userId},
  });

  if (!googleAccount?.accessToken) {
    await upsertGoogleConnection(userId, {
      status: "needs_auth",
      syncError: "Connect Google Calendar before syncing.",
    });
    throw new BadRequestException("Connect Google Calendar before syncing.");
  }

  await upsertGoogleConnection(userId, {
    status: "syncing",
    syncError: null,
  });

  const now = new Date();
  const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const timeMax = new Date(now.getTime() + 180 * 24 * 60 * 60_000);

  let googleBusyBlocks;
  try {
    googleBusyBlocks = await queryGoogleFreeBusy({
      accessToken: googleAccount.accessToken,
      calendarId: primaryCalendarId,
      timeMin,
      timeMax,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Google Calendar sync failed. Reconnect Google if the permission expired.";
    await upsertGoogleConnection(userId, {
      status: "error",
      syncError: message,
    });
    throw new BadRequestException(message);
  }

  const busyBlocks =
    googleBusyBlocks.map((block) => ({
      userId,
      provider: googleProvider,
      calendarId: primaryCalendarId,
      externalEventId: `freebusy-${block.startAt.toISOString()}-${block.endAt.toISOString()}`,
      title: "Busy",
      startAt: block.startAt,
      endAt: block.endAt,
    }));

  await db.transaction(async (tx) => {
    await tx
      .delete(calendarBusyBlock)
      .where(
        and(
          eq(calendarBusyBlock.userId, userId),
          eq(calendarBusyBlock.provider, googleProvider),
          eq(calendarBusyBlock.calendarId, primaryCalendarId),
        ),
      );

    if (busyBlocks.length > 0) {
      await tx.insert(calendarBusyBlock).values(busyBlocks);
    }
  });

  const connection = await upsertGoogleConnection(userId, {
    status: "connected",
    lastSyncedAt: new Date(),
    syncError: null,
  });

  return {
    provider: googleProvider,
    connected: true,
    canSync: true,
    status: connection?.status ?? "connected",
    lastSyncedAt: connection?.lastSyncedAt ?? null,
    syncError: connection?.syncError ?? null,
    importedCount: busyBlocks.length,
  };
};
