import type { Question } from "@qnaplus/scraper";
import { RECF_PROGRAMS, type RecfProgram, getRecfStart, updateRecfQuestions } from "@qnaplus/store";
import { sleep } from "@qnaplus/utils";
import type { Logger } from "pino";
import { getGetQaUrl, getQa } from "recf-api-client";
import { type EtagCache, requestWithEtag } from "./etag";
import { toQuestion } from "./questions";

const ITERATIVE_BATCH_COUNT = 10;

const BATCH_DELAY_MS = 1500;

const fetchQuestionBatch = async (
	slug: RecfProgram,
	range: number[],
	cache: EtagCache,
	logger: Logger,
) => {
	const results = await Promise.all(
		range.map((qnaNumber) =>
			requestWithEtag(
				cache,
				getGetQaUrl(slug, `${qnaNumber}`),
				(options) => getQa(slug, `${qnaNumber}`, options),
				logger,
			),
		),
	);
	const questions: Question[] = [];
	for (const result of results) {
		if (result.outcome !== "success") {
			continue;
		}
		const question = toQuestion(slug, result.data.data, logger);
		if (question !== null) {
			questions.push(question);
		}
	}
	// mirrors the VEX scraper's tolerance: only an entirely unresolvable
	// batch marks the end of the question list, so gaps of unpublished
	// questions smaller than a batch don't halt iteration
	const failed = results.every(
		(result) => result.outcome === "missing" || result.outcome === "error",
	);
	return { questions, failed };
};

/**
 * Fetches every question with a number of `start` or higher, in batches of
 * consecutive numbers, stopping once an entire batch fails to resolve (the
 * same strategy the VEX scraper's `fetchQuestionsIterative` uses). Questions
 * that haven't changed since the last run only cost a bodyless 304 response
 * thanks to the ETag cache, and are left out of the result.
 */
export const fetchRecfQuestionsIterative = async (
	slug: RecfProgram,
	start: number,
	cache: EtagCache,
	logger: Logger,
): Promise<Question[]> => {
	const questions: Question[] = [];
	let range = [...Array(ITERATIVE_BATCH_COUNT).keys()].map((n) => start + n);
	while (true) {
		const batch = await fetchQuestionBatch(slug, range, cache, logger);
		questions.push(...batch.questions);
		if (batch.failed) {
			break;
		}
		range = range.map((n) => n + ITERATIVE_BATCH_COUNT);
		await sleep(BATCH_DELAY_MS);
	}
	return questions;
};

const syncProgram = async (
	slug: RecfProgram,
	cache: EtagCache,
	_logger: Logger,
): Promise<Question[]> => {
	const logger = _logger.child({ program: slug });
	const [startError, start] = await getRecfStart(slug);
	if (startError) {
		logger.error({ error: startError }, "Failed to load start metadata, skipping program.");
		return [];
	}
	const questions = await fetchRecfQuestionsIterative(slug, start, cache, logger);
	logger.info(`Fetched ${questions.length} new or changed questions.`);
	return questions;
};

/**
 * Pulls new and changed questions from the RECF Q&A of every program in
 * {@link RECF_PROGRAMS} and upserts them into the recf_questions table, where
 * the usual event queue trigger turns them into notification events.
 */
export const updateRecfDatabase = async (
	cache: EtagCache,
	_logger: Logger,
): Promise<Question[]> => {
	const logger = _logger.child({ label: "update_recf_database" });
	logger.info("Starting RECF database update.");

	const questions: Question[] = [];
	for (const slug of RECF_PROGRAMS) {
		questions.push(...(await syncProgram(slug, cache, logger)));
	}
	if (questions.length === 0) {
		logger.info("No RECF question changes detected, returning.");
		return [];
	}

	const [updateError, updates] = await updateRecfQuestions(questions);
	if (updateError) {
		logger.error(
			{ error: updateError },
			`Failed to upsert ${questions.length} RECF questions, retrying on next run.`,
		);
		return [];
	}
	logger.info(`${updates.length} new RECF updates detected.`);

	return updates;
};
