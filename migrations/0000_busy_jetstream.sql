CREATE TABLE "contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"name" text NOT NULL,
	"circle_level" integer NOT NULL,
	"interests" text[] DEFAULT '{}'::text[] NOT NULL,
	"birthday" text,
	"last_contacted" text,
	"last_hangout" text,
	"labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"phone" text,
	"email" text,
	"avatar_color" text NOT NULL,
	"photo_uri" text,
	"last_contacted_label" text,
	"last_hangout_label" text,
	"custom_reminders" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hangout_options" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" varchar,
	"label" text NOT NULL,
	"date_time" text,
	"activity" text,
	"location" text,
	"question_type" text DEFAULT 'option' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hangout_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"share_code" text NOT NULL,
	"finalized_option_id" varchar,
	"finalized_time_option_id" varchar,
	"invitee_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"survey_mode" text DEFAULT 'standard' NOT NULL,
	"fixed_activity" text,
	"deadline" text,
	"include_plus_one" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "hangout_plans_share_code_unique" UNIQUE("share_code")
);
--> statement-breakpoint
CREATE TABLE "hangout_votes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_id" varchar,
	"plan_id" varchar,
	"voter_name" text NOT NULL,
	"rank" integer,
	"brings_guests" boolean,
	"plus_one_count" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"profile_photo_uri" text,
	"username" text,
	"push_token" text,
	"notification_timezone" text,
	"suggestion_notif_frequency" text,
	"suggestion_notif_time" text,
	"has_password" boolean DEFAULT true NOT NULL,
	"last_profile_push_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hangout_options" ADD CONSTRAINT "hangout_options_plan_id_hangout_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."hangout_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hangout_plans" ADD CONSTRAINT "hangout_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hangout_votes" ADD CONSTRAINT "hangout_votes_option_id_hangout_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."hangout_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hangout_votes" ADD CONSTRAINT "hangout_votes_plan_id_hangout_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."hangout_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hangout_votes_plan_voter_option_unique" ON "hangout_votes" USING btree ("plan_id","voter_name","option_id");