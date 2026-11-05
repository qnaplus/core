import type { Season } from "@qnaplus/scraper";
import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { EventQueueType } from "./schema_types";
import { numeric } from "drizzle-orm/pg-core";

/**
 * The content columns shared by every Q&A's question table. Defining them once
 * guarantees each table's rows have the same `Question` shape, which the event
 * queue triggers serialize and the bot consumes.
 */
const questionColumns = {
	url: text().notNull(),
	program: text().notNull(),
	season: text().notNull(),
	author: text().notNull(),
	title: text().notNull(),
	question: text().notNull(),
	questionRaw: text().notNull(),
	answer: text(),
	answerRaw: text(),
	askedTimestamp: text().notNull(),
	askedTimestampMs: bigint({ mode: "number" }).notNull(),
	answeredTimestamp: text().default(sql`NULL`),
	answeredTimestampMs: bigint({ mode: "number" }),
	answered: boolean().notNull(),
	tags: text().array().notNull(),
};

/**
 * Questions from the VEX Robotics Q&A.
 */
export const questions = pgTable("questions", {
	id: text().primaryKey(),
	...questionColumns,
}).enableRLS();

/**
 * Questions from the RECF Q&A. Question numbers are only unique within a
 * program, so rows are keyed by a generated uuid.
 */
export const recf_questions = pgTable(
	"recf_questions",
	{
		uuid: uuid().defaultRandom().primaryKey(),
		id: text().notNull(),
		...questionColumns,
	},
	// a unique index rather than a unique constraint: drizzle-kit introspects
	// multi-column constraints with their columns reordered, which makes every
	// `drizzle-kit push` drop and recreate the constraint
	(table) => [uniqueIndex("recf_questions_program_id_unique").on(table.program, table.id)],
).enableRLS();

export const metadata = pgTable("metadata", {
	id: integer().primaryKey(),
	currentSeason: text().$type<Season>().notNull(),
	start: numeric({ mode: "number" }).notNull().default(1),
}).enableRLS();

/**
 * Per-program counterpart of {@link metadata} for the RECF Q&A. A missing row
 * means the program's update starts from question 1.
 */
export const recf_metadata = pgTable("recf_metadata", {
	program: text().primaryKey(),
	start: integer().notNull().default(1),
}).enableRLS();

export const event_queue = pgTable("event_queue", {
	id: uuid().defaultRandom().primaryKey(),
	event: text({ enum: Object.values(EventQueueType) as [string] }).notNull(),
	timestamp: timestamp().notNull().defaultNow(),
	payload: jsonb().notNull(),
}).enableRLS();

export const forum_state = pgTable("forum_state", {
	program: text().primaryKey(),
	open: boolean().notNull().default(true),
}).enableRLS();

/**
 * The last ETag returned for each RECF API resource (keyed by request URL).
 */
export const etag_cache = pgTable("etag_cache", {
	resource: text().primaryKey(),
	etag: text().notNull(),
	updatedAt: timestamp().notNull().defaultNow(),
}).enableRLS();
