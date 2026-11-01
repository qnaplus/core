import { type ILogger as ISapphireLogger, LogLevel } from "@sapphire/framework";
import type { Logger, LoggerExtras } from "pino";

export class PinoLoggerAdapter implements ISapphireLogger {
	readonly pino: Logger;

	constructor(logger: Logger) {
		this.pino = logger;
	}

	has(_level: LogLevel): boolean {
		return true;
	}

	trace(...values: readonly unknown[]): void {
		this.write(LogLevel.Trace, ...values);
	}

	debug(...values: readonly unknown[]): void {
		this.write(LogLevel.Debug, ...values);
	}

	info(...values: readonly unknown[]): void {
		this.write(LogLevel.Info, ...values);
	}

	warn(...values: readonly unknown[]): void {
		this.write(LogLevel.Warn, ...values);
	}

	error(...values: readonly unknown[]): void {
		this.write(LogLevel.Error, ...values);
	}

	fatal(...values: readonly unknown[]): void {
		this.write(LogLevel.Fatal, ...values);
	}

	write(level: LogLevel, ...values: readonly unknown[]): void {
		switch (level) {
			case LogLevel.Trace: {
				this.pino.trace({ values });
				break;
			}
			case LogLevel.Debug: {
				this.pino.debug({ values });
				break;
			}
			case LogLevel.Info: {
				this.pino.info({ values });
				break;
			}
			case LogLevel.Warn: {
				this.pino.warn({ values });
				break;
			}
			case LogLevel.Error: {
				const [maybeError, ...otherValues] = values;
				if (maybeError instanceof Error) {
					this.pino.error({ error: maybeError, otherValues });
				} else {
					this.pino.error({ values });
				}
				break;
			}
			case LogLevel.Fatal: {
				this.pino.fatal({ values });
				break;
			}
			case LogLevel.None:
				break;
			default:
				((_: never) => {})(level); // oxlint-disable-line no-unused-vars
				break;
		}
	}

	child(...args: Parameters<LoggerExtras["child"]>) {
		return this.pino.child(...args);
	}
}
