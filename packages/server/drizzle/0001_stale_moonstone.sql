CREATE TYPE "public"."calendar_connection_status" AS ENUM('connected', 'needs_auth', 'syncing', 'error');--> statement-breakpoint
CREATE TYPE "public"."meeting_participant_kind" AS ENUM('registered', 'guest');--> statement-breakpoint
CREATE TABLE "calendar_busy_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"calendar_id" text NOT NULL,
	"external_event_id" text NOT NULL,
	"title" text,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"status" "calendar_connection_status" DEFAULT 'needs_auth' NOT NULL,
	"last_synced_at" timestamp,
	"sync_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_availability_slot" (
	"meeting_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_availability_slot_participant_id_start_at_end_at_pk" PRIMARY KEY("participant_id","start_at","end_at")
);
--> statement-breakpoint
CREATE TABLE "meeting_participant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"user_id" text,
	"kind" "meeting_participant_kind" NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"guest_token_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_busy_block" ADD CONSTRAINT "calendar_busy_block_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD CONSTRAINT "calendar_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_availability_slot" ADD CONSTRAINT "meeting_availability_slot_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_availability_slot" ADD CONSTRAINT "meeting_availability_slot_participant_id_meeting_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."meeting_participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participant" ADD CONSTRAINT "meeting_participant_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participant" ADD CONSTRAINT "meeting_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_busy_block_external_unique" ON "calendar_busy_block" USING btree ("user_id","provider","calendar_id","external_event_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_connection_user_provider_unique" ON "calendar_connection" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_participant_meeting_user_unique" ON "meeting_participant" USING btree ("meeting_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_participant_guest_token_unique" ON "meeting_participant" USING btree ("guest_token_hash");