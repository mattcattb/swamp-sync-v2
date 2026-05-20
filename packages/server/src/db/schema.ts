import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Better Auth tables
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const meetingRole = pgEnum("meeting_role", ["organizer", "member"]);

export const meetingInviteStatus = pgEnum("meeting_invite_status", [
  "pending",
  "accepted",
  "declined",
]);

export const event = pgTable("event", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, {onDelete: "cascade"}),
  title: text("title").notNull(),
  description: text("description"),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const meeting = pgTable(
  "meeting",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizerId: text("organizer_id")
      .notNull()
      .references(() => user.id, {onDelete: "cascade"}),
    name: text("name").notNull(),
    description: text("description"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    selectedWeekdays: integer("selected_weekdays").array().notNull(),
    dailyStartMinutes: integer("daily_start_minutes").notNull(),
    dailyEndMinutes: integer("daily_end_minutes").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    joinCode: text("join_code").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    joinCodeUnique: uniqueIndex("meeting_join_code_unique").on(table.joinCode),
  }),
);

export const meetingMember = pgTable(
  "meeting_member",
  {
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meeting.id, {onDelete: "cascade"}),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, {onDelete: "cascade"}),
    role: meetingRole("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({columns: [table.meetingId, table.userId]}),
  }),
);

export const meetingInvite = pgTable(
  "meeting_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meeting.id, {onDelete: "cascade"}),
    invitedUserId: text("invited_user_id")
      .notNull()
      .references(() => user.id, {onDelete: "cascade"}),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => user.id, {onDelete: "cascade"}),
    status: meetingInviteStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    meetingInvitedUserUnique: uniqueIndex(
      "meeting_invite_meeting_user_unique",
    ).on(table.meetingId, table.invitedUserId),
  }),
);
