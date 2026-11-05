import { getAllEtags, upsertEtag } from "@qnaplus/store";
import { trycatch } from "@qnaplus/utils";
import type { Logger } from "pino";

/**
 * The response shape shared by all recf-api-client endpoints.
 */
type RecfResponse = {
	status: number;
	data: unknown;
	headers: Headers;
};

type SuccessData<R extends RecfResponse> = Extract<R, { status: 200 }>["data"];

export type EtagRequestResult<T> =
	/** 200; the resource's data (and ETag) was returned. */
	| { outcome: "success"; data: T }
	/** 304; the resource has not changed since it was last fetched. */
	| { outcome: "unchanged" }
	/** 404; the resource does not exist. */
	| { outcome: "missing" }
	/** The request failed or returned an unexpected status (logged). */
	| { outcome: "error" };

/**
 * An in-memory view of the `etag_cache` table. Reads are local; writes update
 * the local copy and are persisted so the cache survives restarts. Load it
 * once at startup and share it across update runs.
 */
export class EtagCache {
	private constructor(private readonly etags: Map<string, string>) {}

	static async load(logger: Logger): Promise<EtagCache> {
		const [error, rows] = await getAllEtags();
		if (error) {
			logger.warn(
				{ error },
				"Failed to load the ETag cache, starting empty (requests will be unconditional).",
			);
			return new EtagCache(new Map());
		}
		logger.info(`Loaded ${rows.length} ETags into the local cache.`);
		return new EtagCache(new Map(rows.map((row) => [row.resource, row.etag])));
	}

	get(resource: string): string | undefined {
		return this.etags.get(resource);
	}

	async set(resource: string, etag: string, logger: Logger) {
		this.etags.set(resource, etag);
		const [error] = await upsertEtag(resource, etag);
		if (error) {
			// non-fatal: the local copy stays correct for this process; only a
			// restart would refetch the resource in full
			logger.warn({ error, resource }, "Failed to persist ETag.");
		}
	}
}

/**
 * Performs a conditional request against the RECF API, sending the cached
 * ETag for `resource` (the full request URL) via `If-None-Match` and caching
 * the ETag of successful responses.
 */
export const requestWithEtag = async <R extends RecfResponse>(
	cache: EtagCache,
	resource: string,
	request: (options: RequestInit) => Promise<R>,
	logger: Logger,
): Promise<EtagRequestResult<SuccessData<R>>> => {
	const etag = cache.get(resource);
	const headers: RequestInit["headers"] = etag ? { "If-None-Match": etag } : {};
	const [requestError, response] = await trycatch(() => request({ headers }));
	if (requestError) {
		logger.error({ error: requestError, resource }, "RECF API request failed.");
		return { outcome: "error" };
	}
	if (response.status === 304) {
		return { outcome: "unchanged" };
	}
	if (response.status === 404) {
		return { outcome: "missing" };
	}
	if (response.status !== 200) {
		logger.error(
			{ status: response.status, resource },
			"RECF API returned an unexpected status.",
		);
		return { outcome: "error" };
	}
	const nextEtag = response.headers.get("etag");
	if (nextEtag !== null) {
		await cache.set(resource, nextEtag, logger);
	}
	// safe: unions of recf-api-client responses are discriminated by `status`
	return { outcome: "success", data: response.data as SuccessData<R> };
};
