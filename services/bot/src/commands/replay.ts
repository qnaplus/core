import { getenv } from "@qnaplus/dotenv";
import type { Question } from "@qnaplus/scraper";
import {
	clearReplayEvents,
	getAnsweredQuestionsNewerThanDate,
	getQuestion,
	getReplayEvents,
	insertReplayEvents,
} from "@qnaplus/store";
import { formatDDMMMYYYY, isValidDate, mmmToMonthNumber } from "@qnaplus/utils";
import { ApplyOptions } from "@sapphire/decorators";
import { PaginatedFieldMessageEmbed } from "@sapphire/discord.js-utilities";
import type { Subcommand } from "@sapphire/plugin-subcommands";
import { Cron } from "croner";
import { EmbedBuilder, hyperlink, inlineCode } from "discord.js";
import { buildQuestionUrl } from "../formatting";
import replay from "../interactions";
import type { PinoLoggerAdapter } from "../utils/logger_adapter";
import { LoggerSubcommand } from "../utils/logger_subcommand";

@ApplyOptions<Subcommand.Options>({
	name: replay.interaction.name,
	description: replay.interaction.description,
	requiredUserPermissions: ["Administrator"],
	requiredClientPermissions: ["SendMessages"],
	subcommands: [
		{
			name: replay.commands.id.name,
			chatInputRun: "replayId",
		},
		{
			name: replay.commands.bulkId.name,
			chatInputRun: "replayBulkId",
		},
		{
			name: replay.commands.bulkDate.name,
			chatInputRun: "replayBulkDate",
		},
		{
			name: replay.commands.list.name,
			chatInputRun: "replayList",
		},
		{
			name: replay.commands.cancel.name,
			chatInputRun: "replayCancel",
		},
	],
})
export class Replay extends LoggerSubcommand {
	private static readonly CHAT_INPUT_DEVELOPMENT_ID: string = "1255678004143849493";
	private static readonly CHAT_INPUT_PRODUCTION_ID: string = "1257270022372593694";

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand(replay.interaction, {
			idHints: [Replay.CHAT_INPUT_DEVELOPMENT_ID, Replay.CHAT_INPUT_PRODUCTION_ID],
		});
	}

	public async replayId(interaction: Subcommand.ChatInputCommandInteraction) {
		const logger = (this.container.logger as PinoLoggerAdapter).child({
			label: "replayId",
		});
		const id = interaction.options.getString("id", true);

		const [questionError, question] = await getQuestion(id);
		if (questionError) {
			this.logErrorAndReply(
				logger,
				interaction,
				`An error occurred while attempting to retreive question with id ${id}, exiting.`,
				{ error: questionError },
			);
			return;
		}
		if (question === undefined) {
			this.logWarnAndReply(
				logger,
				interaction,
				`No question with the id '${id}' was found, exiting.`,
			);
			return;
		}

		const [replayError] = await insertReplayEvents([question]);
		if (!replayError) {
			this.logErrorAndReply(
				logger,
				interaction,
				`Unable to queue question with id '${id}' for renotification`,
				{ error: replayError },
			);
			return;
		}
		this.logInfoAndReply(
			logger,
			interaction,
			`Queued question with id '${id}' for renotification.${this.getNextRuntimeString()} Cancel anytime using /replay cancel.`,
		);
	}

	public async replayBulkId(interaction: Subcommand.ChatInputCommandInteraction) {
		const logger = (this.container.logger as PinoLoggerAdapter).child({
			label: "replayBulkId",
		});
		const id = interaction.options.getString("id", true);
		const [questionError, question] = await getQuestion(id);
		if (questionError) {
			this.logErrorAndReply(
				logger,
				interaction,
				`An error occurred while attempting to retreive question with id ${id}, exiting.`,
				{ error: questionError },
			);
			return;
		}
		if (question === undefined) {
			this.logWarnAndReply(
				logger,
				interaction,
				`No question with the id '${id}' was found, exiting.`,
			);
			return;
		}
		try {
			const count = await this.doReplayBulkDate(question.askedTimestampMs);
			this.logInfoAndReply(
				logger,
				interaction,
				`Successfully queued ${count} questions for renotification.${this.getNextRuntimeString()} Cancel anytime using /replay cancel.`,
			);
		} catch (e) {
			this.logErrorAndReply(logger, interaction, "An error occurred", e as object);
		}
	}

	public async replayBulkDate(interaction: Subcommand.ChatInputCommandInteraction) {
		const logger = (this.container.logger as PinoLoggerAdapter).child({
			label: "replayBulkDate",
		});
		const date = interaction.options.getString("date", true);
		const regex = /(\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})/;
		const match = date.match(regex);
		if (match === null) {
			this.logErrorAndReply(
				logger,
				interaction,
				`${date} does not match the format 'DD-MMM-YYYY', exiting.`,
			);
			return;
		}
		const computedDate = new Date(date);
		const [, day, mmm, year] = match;
		const month = mmmToMonthNumber(mmm);
		if (!isValidDate(new Date(date), Number.parseInt(year), month, Number.parseInt(day))) {
			this.logErrorAndReply(
				logger,
				interaction,
				`Provided date is invalid (read as '${date}', computed as '${formatDDMMMYYYY(computedDate)}').`,
			);
			return;
		}
		try {
			const count = await this.doReplayBulkDate(computedDate.getTime());
			this.logInfoAndReply(
				logger,
				interaction,
				`Successfully queued ${count} questions for renotification.${this.getNextRuntimeString()} Cancel anytime using /replay cancel.`,
			);
		} catch (e) {
			this.logErrorAndReply(logger, interaction, "An error occurred", e as object);
		}
	}

	public async replayList(interaction: Subcommand.ChatInputCommandInteraction) {
		const logger = (this.container.logger as PinoLoggerAdapter).child({
			label: "replayList",
		});
		const [replayError, replayEvents] = await getReplayEvents();
		if (replayError) {
			this.logErrorAndReply(logger, interaction, "Error retreiving replay queue.", {
				error: replayError,
			});
			return;
		}
		const questions = replayEvents.map((r) => r.question);
		if (questions.length === 0) {
			this.logInfoAndReply(logger, interaction, "No questioned queued for renotification.");
			return;
		}

		const template = new EmbedBuilder().setColor("Blurple");
		const formatter = ({ author, askedTimestamp, title, id }: Question, index: number) => {
			const num = ` #${index + 1} `;
			return `${inlineCode(num)} ${hyperlink(title, buildQuestionUrl(id))}\nAsked by ${author} on ${askedTimestamp}\n`;
		};

		new PaginatedFieldMessageEmbed<Question>()
			.setTitleField("Replay Queue")
			.setTemplate(template)
			.setItems(questions)
			.formatItems(formatter)
			.setItemsPerPage(5)
			.make()
			.run(interaction);
	}

	public async replayCancel(interaction: Subcommand.ChatInputCommandInteraction) {
		const logger = (this.container.logger as PinoLoggerAdapter).child({
			label: "replayCancel",
		});
		const [clearError, clearResult] = await clearReplayEvents();
		if (clearError) {
			this.logErrorAndReply(
				logger,
				interaction,
				"An error occurred while clearing replay queue.",
				{ error: clearError },
			);
			return;
		}
		this.logInfoAndReply(
			logger,
			interaction,
			`Successfully cleared ${clearResult.length} questions from the replay queue.`,
		);
	}

	private async doReplayBulkDate(dateMs: number) {
		const [questionsError, questions] = await getAnsweredQuestionsNewerThanDate(dateMs);
		if (questionsError) {
			throw questionsError;
		}
		if (questions.length === 0) {
			return 0;
		}
		const [replayError, replayResult] = await insertReplayEvents(questions);
		if (replayError) {
			throw { error: replayError };
		}
		return replayResult.length;
	}

	private getNextRuntimeString() {
		const nextRuntime = new Cron(getenv("DATABASE_UPDATE_INTERVAL")).msToNext();
		if (nextRuntime === null) {
			return "";
		}
		const minutes = Math.round(nextRuntime / 1000 / 60);
		return ` ${minutes} minutes until next run.`;
	}
}
