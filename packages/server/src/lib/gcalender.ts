type GoogleFreeBusyResponse = {
  calendars?: Record<
    string,
    {
      busy?: Array<{
        start: string;
        end: string;
      }>;
    }
  >;
  error?: {
    message?: string;
  };
};

export const queryGoogleFreeBusy = async ({
  accessToken,
  calendarId,
  timeMin,
  timeMax,
}: {
  accessToken: string;
  calendarId: string;
  timeMin: Date;
  timeMax: Date;
}) => {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{id: calendarId}],
      }),
    },
  );

  const json = (await response
    .json()
    .catch(() => ({}))) as GoogleFreeBusyResponse;

  if (!response.ok) {
    throw new Error(
      json.error?.message ??
        "Google Calendar sync failed. Reconnect Google if the permission expired.",
    );
  }

  return (
    json.calendars?.[calendarId]?.busy?.map((block) => ({
      startAt: new Date(block.start),
      endAt: new Date(block.end),
    })) ?? []
  );
};
