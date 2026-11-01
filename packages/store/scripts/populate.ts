import {
	type FetchClient,
	type FetchClientResponse,
	getAllQuestions as archiverGetAllQuestions,
	fetchCurrentSeason,
	getOldestQuestion,
	getOldestUnansweredQuestion,
} from "@qnaplus/scraper";
import { CurlImpersonateScrapingClient } from "@qnaplus/scraper-strategies";
import { trycatch } from "@qnaplus/utils";
import pino, { type Logger } from "pino";
import {
	METADATA_ROW_ID,
	db,
	disconnectPgClient,
	insertQuestions,
	testConnection,
} from "../src/database";
import * as schema from "../src/schema";

export const populate = async (
	client: FetchClient<FetchClientResponse>,
	logger?: Logger,
) => {
	const { questions } = await archiverGetAllQuestions({ client, logger });
	return insertQuestions(questions);
};

export const populateWithMetadata = async (
	client: FetchClient<FetchClientResponse>,
	logger?: Logger,
) => {
	const { questions } = await archiverGetAllQuestions({ client, logger });
	const currentSeason = await fetchCurrentSeason({ client, logger });

	const oldestUnansweredQuestion = getOldestUnansweredQuestion(
		questions,
		currentSeason,
	);
	const oldestQuestion = getOldestQuestion(questions, currentSeason);
	if (oldestQuestion === undefined) {
		logger?.error(
			"An unexpected error occurred: unable to find oldest question from current season, exiting.",
		);
		return;
	}

	// assert non-null since we know the scraper is starting from the beginning
	// meaning we are practically guaranteed at least one "oldest question"
	const oldestQuestionId =
		oldestUnansweredQuestion !== undefined
			? oldestUnansweredQuestion.id
			: oldestQuestion.id;

	const [error] = await trycatch(() =>
		db().transaction(async (tx) => {
			if (questions.length !== 0) {
				await insertQuestions(questions, tx);
			}
			await tx.insert(schema.metadata).values({
				id: METADATA_ROW_ID,
				currentSeason,
				start: Number.parseInt(oldestQuestionId),
			});
		}),
	);
	if (error) {
		logger?.error(
			{ error },
			"An error occurred while attempting to populate the database.",
		);
		return;
	}
	logger?.info("Successfully populated database");
};

(async () => {
	const logger = pino({ errorKey: "error" });
	const client = new CurlImpersonateScrapingClient(logger);
	logger.info("Running populate script.");
	logger.info("Testing database connection...");
	const [error] = await testConnection();
	if (error) {
		logger.error({ error }, "Unable to connect to database, exiting.");
		return;
	}
	if (process.argv[2] === "--metadata") {
		logger.info("Starting database population (with metadata).");
		await populateWithMetadata(client, logger);
	} else {
		logger.info("Starting database population (without metadata).");
		await populate(client, logger);
	}
	logger.info("Database population completed.");
	await disconnectPgClient();
})();
