import { disconnectPgClient, getAllQuestions, getMetadata, testConnection } from "@qnaplus/store";
import pino from "pino";
import { uploadAllToStorage } from "../src/update_storage";
import { initializeEnv } from "@qnaplus/dotenv";

(async () => {
    await initializeEnv();
    
    const logger = pino({ errorKey: "error" });
    logger.info("Running storage update script.");
    logger.info("Testing database connection...");
    const [error] = await testConnection();
    if (error) {
        logger.error({ error }, "Unable to connect to database, exiting.");
        return;
    }
    logger.info("Fetching metadata and all questions from database.");
    const [metadataError, metadata] = await getMetadata();
    if (metadataError || !metadata) {
        logger.error({ error: metadataError }, "Unable to fetch metadata from database, exiting.");
        return;
    }
    const [questionsError, questions] = await getAllQuestions();
    if (questionsError) {
        logger.error({ error: questionsError }, "Unable to fetch questions from database, exiting.");
        return;
    }
    logger.info(`Fetched ${questions.length} questions. Starting storage upload.`);
    await uploadAllToStorage(questions, metadata, logger);
    logger.info("Storage upload completed.");
    await disconnectPgClient();
})();
