import {
	type FetchClient,
	type FetchClientResponse,
	type Season,
	checkIfReadOnly,
	pingQna,
} from "@qnaplus/scraper";
import { getAllPrograms, getForumStates, Metadata, updateForumStates } from "@qnaplus/store";
import type { Logger } from "pino";

type ProgramState = {
	program: string;
	open: boolean;
};

const getNextSeason = (season: Season) => {
	if (!/^\d{4}-\d{4}$/.test(season)) {
		throw new Error(`Invalid season '${season}' provided.`);
	}
	const endYear = Number.parseInt(season.split("-")[1]);
	return `${endYear}-${endYear + 1}`;
};

export const updateForumStatus = async (
	client: FetchClient<FetchClientResponse>,
	{ currentSeason: season }: Metadata,
	logger_: Logger,
) => {
	const logger = logger_.child({ label: "update_forum_status" });
	logger.info("Starting programs update.");
	const [programsError, programs] = await getAllPrograms();
	if (programsError) {
		logger.error(
			{ error: programsError },
			"An error occurred while trying to aggregate all programs, exiting.",
		);
		return;
	}
	const [statesError, states] = await getForumStates();
	if (statesError) {
		logger.error(
			{ error: statesError },
			"An error occurred while trying to fetch existing Q&A states, exiting.",
		);
		return;
	}
	const statesMap = states.reduce<Record<string, boolean>>((map, s) => {
		map[s.program] = s.open;
		return map;
	}, {});

	const newStates: ProgramState[] = [];
	for (const { program } of programs) {
		// get the 'open' state for a given program
		// if there is none, default to true so we can initialize one
		const currentOpenState = statesMap[program] ?? true;
		let open: boolean;
		if (currentOpenState || program.toLowerCase() === "judging") {
			logger.info(`Forum for ${program} is open, checking readonly status.`);
			const readonly = await checkIfReadOnly(program, season, {
				client,
				logger,
			});
			if (readonly === null) {
				logger.warn(`Unable to check state for ${program} (${season}), skipping.`);
				continue;
			}
			open = !readonly;
		} else {
			logger.info(
				`Forum for ${program} is closed, checking availability of the next Q&A forum.`,
			);
			open = await pingQna(program, getNextSeason(season), { client, logger });
		}

		logger.info(`Forum state for ${program}: ${open}`);

		newStates.push({ program, open });
	}
	if (newStates.length === 0) {
		logger.warn("Unable to update forum states.");
		return;
	}
	const [updatedError] = await updateForumStates(newStates);
	if (updatedError) {
		logger.error(
			{ error: updatedError },
			"An error occurred while updating forum states, exiting.",
		);
		return;
	}
	logger.info("Completed forum states update.");
};
