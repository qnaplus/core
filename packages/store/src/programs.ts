/**
 * The slugs of all RECF programs with a Q&A, as defined by the RECF API's
 * `listPrograms` endpoint. Broadcast channels are keyed by these values.
 */
export const RECF_PROGRAMS = ["inspire", "achieve", "engage"] as const;

export type RecfProgram = (typeof RECF_PROGRAMS)[number];

/**
 * Whether a question's program belongs to the RECF Q&A. RECF slugs never
 * overlap with VEX program names (V5RC, VIQRC, etc.), so a question's program
 * also identifies the Q&A it came from.
 */
export const isRecfProgram = (program: string): program is RecfProgram => {
	return (RECF_PROGRAMS as readonly string[]).includes(program);
};
