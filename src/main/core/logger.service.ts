/**
 * Logger Service - Production-grade logging for VizCloud.
 *
 * Wraps electron-log with a per-instance `source` tag so log lines are
 * attributable to a specific subsystem (Database, IPC, HostService, etc.).
 *
 * The underlying electron-log singleton is configured exactly once via
 * `configureLogger()`; subsequent `new LoggerService(...)` calls only attach
 * a source tag and reuse the configured transports.
 */

import { app } from 'electron';
import log, { type LogLevel as ElectronLogLevel } from 'electron-log';
import { join } from 'path';

export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    FATAL = 'fatal',
}

interface LogPayload {
    timestamp: number;
    level: LogLevel;
    source: string;
    message: string;
    data?: unknown;
}

type LogSubscriber = (entry: LogPayload) => void;

let configured = false;
const subscribers = new Set<LogSubscriber>();

function configureLogger(): void {
    if (configured) {
        return;
    }
    const logDir = join(app.getPath('userData'), 'logs');

    log.transports.file.resolvePathFn = (): string => {
        const date = new Date();
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return join(logDir, `vizcloud-${yyyy}-${mm}-${dd}.log`);
    };

    log.transports.file.format = '{y}-{M}-{d} {h}:{i}:{s}.{ms} [{level}] {text}';
    log.transports.file.level = 'debug';
    log.transports.file.maxSize = 10 * 1024 * 1024; // 10 MB

    log.transports.console.level = 'info';
    log.transports.console.format = '[{level}] {text}';

    log.errorHandler.startCatching({
        showDialog: false,
        onError: (options): void => {
            log.error('[uncaught]', options.error);
        },
    });

    configured = true;
}

/**
 * Subscribe to every log entry across the app (e.g. to fan out to a UI panel
 * or a database table). Returns an unsubscribe function.
 */
export function subscribeToLogs(subscriber: LogSubscriber): () => void {
    subscribers.add(subscriber);
    return (): void => {
        subscribers.delete(subscriber);
    };
}

export class LoggerService {
    private readonly source: string;

    constructor(source: string) {
        this.source = source;
        configureLogger();
    }

    public debug(message: string, data?: unknown): void {
        this.write(LogLevel.DEBUG, message, data);
    }

    public info(message: string, data?: unknown): void {
        this.write(LogLevel.INFO, message, data);
    }

    public warn(message: string, data?: unknown): void {
        this.write(LogLevel.WARN, message, data);
    }

    public error(message: string, data?: unknown): void {
        this.write(LogLevel.ERROR, message, data);
    }

    /**
     * `fatal` maps to electron-log's `error` level (electron-log has no
     * dedicated fatal transport) but is preserved as a separate semantic.
     */
    public fatal(message: string, data?: unknown): void {
        this.write(LogLevel.FATAL, message, data);
    }

    public setLevel(level: LogLevel): void {
        const electronLevel: ElectronLogLevel = level === LogLevel.FATAL ? 'error' : level;
        log.transports.file.level = electronLevel;
        log.transports.console.level = electronLevel;
    }

    public getLogDirectory(): string {
        return join(app.getPath('userData'), 'logs');
    }

    private write(level: LogLevel, message: string, data?: unknown): void {
        const formatted = `[${this.source}] ${message}${data === undefined ? '' : ` ${safeStringify(data)}`}`;
        const electronLevel: ElectronLogLevel = level === LogLevel.FATAL ? 'error' : level;
        log[electronLevel](formatted);
        if (subscribers.size > 0) {
            const payload: LogPayload = {
                timestamp: Date.now(),
                level,
                source: this.source,
                message,
                data,
            };
            for (const subscriber of subscribers) {
                try {
                    subscriber(payload);
                } catch (subscriberError) {
                    // Never let a subscriber error mask the original log entry.
                    log.error(`[Logger] subscriber threw: ${String(subscriberError)}`);
                }
            }
        }
    }
}

function safeStringify(value: unknown): string {
    try {
        if (value instanceof Error) {
            return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`;
        }
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

// Default logger for top-level orchestration code.
export const logger = new LoggerService('App');
