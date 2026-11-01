import { getenv } from "@qnaplus/dotenv";
import type { Question } from "@qnaplus/scraper";
import { lazy, trycatch } from "@qnaplus/utils";
import { and, eq, getTableColumns, gte, inArray, or, sql } from "drizzle-orm";
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { type EventQueueAggregation, EventQueueType } from "./schema_types";

const pg = lazy(() => postgres(getenv("SUPABASE_TRANSACTION_URL")));
export const db = lazy(() => drizzle({ schema, client: pg() }));

export const disconnectPgClient = async () => {
	const client = pg();
	if (client !== null) {
		await client.end();
	}
};

export const METADATA_ROW_ID = 0;

export const testConnection = async (d: PostgresJsDatabase<typeof schema> = db()) => {
	return trycatch(() => d.execute(sql`select 1`));
};

export const getQuestion = async (
	id: Question["id"],
	d: PostgresJsDatabase<typeof schema> = db(),
) => {
	return trycatch(() => d.query.questions.findFirst({ where: eq(schema.questions.id, id) }));
};

export const getAllQuestions = async (d: PostgresJsDatabase<typeof schema> = db()) => {
	return trycatch(() => d.select().from(schema.questions));
};

export const getAllSeasonQuestions = async (d: PostgresJsDatabase<typeof schema> = db()) => {
	const currentSeason = d.$with("current_season").as(
		d
			.select({ season: sql<string>`${schema.metadata.currentSeason}`.as("s") })
			.from(schema.metadata)
			.limit(1),
	);
	return trycatch(() =>
		d
			.with(currentSeason)
			.select(getTableColumns(schema.questions))
			.from(schema.questions)
			.innerJoin(currentSeason, eq(schema.questions.season, currentSeason.season)),
	);
};

export const getAnsweredQuestionsNewerThanDate = async (
	ms: number,
	d: PostgresJsDatabase<typeof schema> = db(),
) => {
	return trycatch(() =>
		d
			.select()
			.from(schema.questions)
			.where(
				and(
					gte(schema.questions.answeredTimestampMs, ms),
					eq(schema.questions.answered, true),
				),
			),
	);
};

export const insertQuestions = async (
	data: Question[],
	d: PostgresJsDatabase<typeof schema> = db(),
) => {
	return trycatch(() => d.insert(schema.questions).values(data));
};

const EXCLUDED_QUESTION = {
	id: sql`excluded.id`,
	url: sql`excluded.url`,
	author: sql`excluded.author`,
	program: sql`excluded.program`,
	title: sql`excluded.title`,
	question: sql`excluded.question`,
	questionRaw: sql`excluded."questionRaw"`,
	answer: sql`excluded.answer`,
	answerRaw: sql`excluded."answerRaw"`,
	season: sql`excluded.season`,
	askedTimestamp: sql`excluded."askedTimestamp"`,
	askedTimestampMs: sql`excluded."askedTimestampMs"`,
	answeredTimestamp: sql`excluded."answeredTimestamp"`,
	answeredTimestampMs: sql`excluded."answeredTimestampMs"`,
	answered: sql`excluded.answered`,
	tags: sql`excluded.tags`,
};

type QuestionTable = typeof schema.questions | typeof schema.recf_questions;

/**
 * Restricts an upsert to rows whose content actually changed, so the event
 * queue triggers only fire for meaningful updates.
 */
const questionUpdatedQuery = (table: QuestionTable) => {
	return or(
		sql`${table.question} != excluded.question`,
		sql`${table.answer} IS DISTINCT FROM excluded.answer`,
		sql`${table.answered} != excluded.answered`,
	);
};

export const updateQuestions = async (
	data: Question[],
	d: PostgresJsDatabase<typeof schema> = db(),
) => {
	return trycatch(() =>
		d
			.insert(schema.questions)
			.values(data)
			.onConflictDoUpdate({
				target: schema.questions.id,
				set: EXCLUDED_QUESTION,
				setWhere: questionUpdatedQuery(schema.questions),
			})
			.returning(),
	);
};

/**
 * Upserts questions from the RECF Q&A. Rows share the {@link Question} shape
 * of VEX questions, so the same event queue trigger handles their updates.
 */
export const updateRecfQuestions = async (
	data: Question[],
	d: PostgresJsDatabase<typeof schema> = db(),
) => {
	return trycatch(() =>
		d
			.insert(schema.recf_questions)
			.values(data)
			.onConflictDoUpdate({
				target: [schema.recf_questions.program, schema.recf_questions.id],
				set: EXCLUDED_QUESTION,
				setWhere: questionUpdatedQuery(schema.recf_questions),
			})
			.returning(),
	);
};

export const getEventQueue = async (d: PostgresJsDatabase<typeof schema> = db()) => {
	const formattedPayloads = d.$with("formatted_payloads").as(
		d
			.select({
				event: schema.event_queue.event,
				payload:
					sql`jsonb_build_object('id', ${schema.event_queue.id}, 'payload', ${schema.event_queue.payload})`.as(
						"payload",
					),
			})
			.from(schema.event_queue)
			.orderBy(schema.event_queue.timestamp),
	);

	const aggregatedPayloads = d.$with("aggregated_payloads").as(
		d
			.select({
				event: formattedPayloads.event,
				payloads: sql`array_agg(${formattedPayloads.payload})`.as("payloads"),
			})
			.from(formattedPayloads)
			.groupBy(formattedPayloads.event),
	);
	return trycatch(() =>
		d
			.with(formattedPayloads, aggregatedPayloads)
			.select({
				queue: sql<EventQueueAggregation | null>`jsonb_object_agg(${schema.event_queue.event}, ${aggregatedPayloads.payloads})`,
			})
			.from(aggregatedPayloads),
	);
};

export const clearEventQueue = async (
	ids: string[],
	d: PostgresJsDatabase<typeof schema> = db(),
) => {
	return trycatch(() => d.delete(schema.event_queue).where(inArray(schema.event_queue.id, ids)));
};

export const getMetadata = async (d: PostgresJsDatabase<typeof schema> = db()) => {
	return trycatch(() => d.query.metadata.findFirst());
};

export const updateMetadata = async (
	data: Partial<Omit<typeof schema.metadata.$inferInsert, "id">>,
	d: PostgresJsDatabase<typeof schema> = db(),
) => {
	return trycatch(() =>
		d
			.update(schema.metadata)
			.set({ ...data })
			.where(eq(schema.metadata.id, METADATA_ROW_ID)),
	);
};

export const getReplayEvents = async (d: PostgresJsDatabase<typeof schema> = db()) => {
	return trycatch(() =>
		d
			.select({ question: schema.questions })
			.from(schema.event_queue)
			.innerJoin(schema.questions, eq(schema.event_queue.event, EventQueueType.Replay)),
	);
};

export const insertReplayEvents = async (
	questions: Question[],
	d: PostgresJsDatabase<typeof schema> = db(),
) => {
	const events = questions.map((question) => ({
		event: EventQueueType.Replay,
		payload: { question },
	}));
	return trycatch(() =>
		d.insert(schema.event_queue).values(events).onConflictDoNothing().returning(),
	);
};

export const clearReplayEvents = async (d: PostgresJsDatabase<typeof schema> = db()) => {
	return trycatch(() =>
		d.delete(schema.event_queue).where(eq(schema.event_queue.event, EventQueueType.Replay)),
	);
};

export const getAllPrograms = async (d: PostgresJsDatabase<typeof schema> = db()) => {
	return trycatch(() =>
		d.selectDistinct({ program: schema.questions.program }).from(schema.questions),
	);
};

export const getForumStates = async (d: PostgresJsDatabase<typeof schema> = db()) => {
	return trycatch(() => d.select().from(schema.forum_state));
};

/**
 * Retrieves the question number the given RECF program's update should start
 * iterating from, defaulting to 1 when the program has no metadata row. Like
 * {@link Metadata.start}, this is a manually managed lever for skipping
 * questions from previous seasons.
 */
export const getRecfStart = async (
	program: string,
	d: PostgresJsDatabase<typeof schema> = db(),
) => {
	return trycatch(async () => {
		const row = await d.query.recf_metadata.findFirst({
			where: eq(schema.recf_metadata.program, program),
		});
		return row?.start ?? 1;
	});
};

export const getAllEtags = async (d: PostgresJsDatabase<typeof schema> = db()) => {
	return trycatch(() => d.select().from(schema.etag_cache));
};

export const upsertEtag = async (
	resource: string,
	etag: string,
	d: PostgresJsDatabase<typeof schema> = db(),
) => {
	return trycatch(() =>
		d
			.insert(schema.etag_cache)
			.values({ resource, etag })
			.onConflictDoUpdate({
				target: schema.etag_cache.resource,
				set: { etag, updatedAt: sql`now()` },
			}),
	);
};

export const updateForumStates = async (
	states: (typeof schema.forum_state.$inferInsert)[],
	d: PostgresJsDatabase<typeof schema> = db(),
) => {
	return trycatch(() =>
		d
			.insert(schema.forum_state)
			.values(states)
			.onConflictDoUpdate({
				target: schema.forum_state.program,
				set: {
					open: sql`excluded.open`,
				},
				setWhere: sql`${schema.forum_state.open} != excluded.open`,
			}),
	);
};
