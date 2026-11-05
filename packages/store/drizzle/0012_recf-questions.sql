CREATE TABLE "etag_cache" (
	"resource" text PRIMARY KEY NOT NULL,
	"etag" text NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "etag_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recf_metadata" (
	"program" text PRIMARY KEY NOT NULL,
	"start" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recf_metadata" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recf_questions" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" text NOT NULL,
	"url" text NOT NULL,
	"program" text NOT NULL,
	"season" text NOT NULL,
	"author" text NOT NULL,
	"title" text NOT NULL,
	"question" text NOT NULL,
	"questionRaw" text NOT NULL,
	"answer" text,
	"answerRaw" text,
	"askedTimestamp" text NOT NULL,
	"askedTimestampMs" bigint NOT NULL,
	"answeredTimestamp" text DEFAULT NULL,
	"answeredTimestampMs" bigint,
	"answered" boolean NOT NULL,
	"tags" text[] NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recf_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "recf_questions_program_id_unique" ON "recf_questions" USING btree ("program","id");