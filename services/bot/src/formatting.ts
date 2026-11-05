import { getenv } from "@qnaplus/dotenv";
import type { Question } from "@qnaplus/scraper";
import { type EventQueueItem, type EventQueueType, isRecfProgram } from "@qnaplus/store";
import { chunk } from "@qnaplus/utils";
import { capitalizeFirstLetter } from "@sapphire/utilities";
import { diffSentences } from "diff";
import { type ColorResolvable, Colors, EmbedBuilder, bold, codeBlock, hyperlink } from "discord.js";

const colors: Record<string, ColorResolvable> = {
	V5RC: "#f54242",
	VURC: "#8a42f5",
	VAIRC: "#42f569",
	VIQRC: "#4290f5",
	judging: "#f5ad42",
	inspire: "#42d7f5",
	achieve: "#f5428a",
	engage: "#7df542",
};

export const buildQuestionUrl = (id: string) => {
	return `${getenv("QNA_WEBSITE")}/${id}`;
};

/**
 * The link a broadcast should point readers to. The qnaplus website only
 * renders VEX questions (and routes them by their VEX question number), so
 * RECF questions link to their page on the RECF site instead.
 */
const getQuestionLink = (question: Question) => {
	return isRecfProgram(question.program) ? question.url : buildQuestionUrl(question.id);
};

const baseEmbedDescription = (question: Question) => {
	const { author, askedTimestamp, title } = question;
	return `Asked by ${author} on ${askedTimestamp}\n${bold("Question")}: ${hyperlink(title, getQuestionLink(question))}`;
};

type ChangeFormatMap = {
	[K in EventQueueType]: (data: EventQueueItem<K>["payload"]) => EmbedBuilder;
};

const formats: ChangeFormatMap = {
	answered({ question }) {
		return new EmbedBuilder()
			.setColor(colors[question.program])
			.setFooter({
				text: question.tags.length > 0 ? `🏷️ ${question.tags.join(", ")}` : "No tags",
			})
			.setTitle(`New ${capitalizeFirstLetter(question.program)} Q&A response`)
			.setDescription(baseEmbedDescription(question));
	},
	replay({ question }) {
		return new EmbedBuilder()
			.setColor(colors[question.program])
			.setFooter({
				text: question.tags.length > 0 ? `🏷️ ${question.tags.join(", ")}` : "No tags",
			})
			.setTitle(`New ${capitalizeFirstLetter(question.program)} Q&A response`)
			.setDescription(baseEmbedDescription(question));
	},
	answer_edited({ before, after }) {
		const description = baseEmbedDescription(after);
		// biome-ignore lint: style/noNonNullAssertion
		const diff = diffSentences(before.answer!, after.answer!);
		const diffStrs = diff
			.filter((p) => p.added || p.removed)
			.map((p) => (p.added ? `+${p.value}` : `-${p.value}`));
		for (let i = 0; i < diffStrs.length; i++) {
			const nextIdx = Math.min(i + 1, diffStrs.length - 1);
			const expected = ["-", "+"][i % 2];
			if (!diffStrs[i].startsWith(expected)) {
				diffStrs.splice(nextIdx, 0, "");
				i++;
			}
		}

		const diffBlocks = chunk(diffStrs, 2)
			.map((c) => codeBlock("diff", c.join("\n")))
			.join("\n");

		return new EmbedBuilder()
			.setColor(colors[after.program])
			.setFooter({
				text: after.tags.length > 0 ? `🏷️ ${after.tags.join(", ")}` : "No tags",
			})
			.setTitle(`${capitalizeFirstLetter(after.program)} Q&A response edited`)
			.setDescription(`${description}\n${diffBlocks}`);
	},
	forum_change({ before, after }) {
		const opened = !before.open && after.open;
		const status = opened ? "opened" : "closed";
		const message = `Q&A forum ${status} for ${after.program}`;
		return new EmbedBuilder()
			.setTitle(message)
			.setColor(opened ? Colors.Green : Colors.DarkRed);
	},
} as const;

export const buildEventEmbed = <T extends EventQueueType>(event: T, data: EventQueueItem<T>) => {
	return formats[event](data.payload);
};
