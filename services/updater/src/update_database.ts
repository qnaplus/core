import {
	type FetchClient,
	type FetchClientResponse,
	fetchQuestionsIterative,
	Question,
} from "@qnaplus/scraper";
import { Metadata, updateQuestions } from "@qnaplus/store";
import type { Logger } from "pino";

export interface DatabaseUpdateStatus {
	updateStorage: boolean;
}

export const updateDatabase = async (
	client: FetchClient<FetchClientResponse>,
	{ start }: Metadata,
	_logger: Logger,
): Promise<Question[]> => {
	const logger = _logger?.child({ label: "update_database" });
	logger.info("Starting database update.");

	const { questions } = await fetchQuestionsIterative({
		client,
		logger,
		start,
	});
	if (questions.length === 0) {
		logger.info("No new questions to insert, returning.");
		return [];
	}

	const [updateError, updates] = await updateQuestions(questions);
	if (updateError) {
		logger.error(
			{ error: updateError },
			`Failed to upsert ${questions.length} questions, retrying on next run.`,
		);
		return [];
	}
	logger.info(`${updates.length} new updates detected.`);

	return updates;
};
