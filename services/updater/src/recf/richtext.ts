/**
 * RECF Q&A bodies are rich-text block documents with a vendor-specific,
 * loosely-typed shape (`Record<string, unknown>` in the API spec). The raw
 * document is stored alongside each question for faithful rendering later,
 * so this module only needs to produce a plain-text approximation that is
 * good enough for Discord embeds and answer-edit diffing.
 */

type RichTextBody = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === "object" && value !== null;
};

/**
 * Collects the string values of every `text` field in the node, depth-first,
 * which covers the common rich-text conventions (e.g., ProseMirror/Lexical
 * style `{ type, content: [{ text: "..." }] }` trees).
 */
const collectText = (node: unknown): string[] => {
	if (Array.isArray(node)) {
		return node.flatMap(collectText);
	}
	if (!isRecord(node)) {
		return [];
	}
	const texts: string[] = [];
	if (typeof node.text === "string") {
		texts.push(node.text);
	}
	for (const value of Object.values(node)) {
		texts.push(...collectText(value));
	}
	return texts;
};

/**
 * Treats the first array found at the top level of the document as its list
 * of blocks, falling back to the document itself as a single block.
 */
const findBlocks = (body: RichTextBody): unknown[] => {
	for (const value of Object.values(body)) {
		if (Array.isArray(value)) {
			return value;
		}
	}
	return [body];
};

/**
 * Extracts a plain-text approximation of a rich-text block document. Inline
 * runs within a block are concatenated as-is; blocks are joined by newlines.
 */
export const richTextToPlainText = (body: RichTextBody): string => {
	return findBlocks(body)
		.map((block) => collectText(block).join(""))
		.filter((text) => text.length > 0)
		.join("\n");
};
