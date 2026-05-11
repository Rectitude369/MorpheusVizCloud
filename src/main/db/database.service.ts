/**
 * Database Service — typed SQLite wrapper for VizCloud.
 *
 * Provides:
 *   • Connection lifecycle (initialize / close / integrity check / vacuum)
 *   • A migration runner driven by `MIGRATIONS` from `./schema`
 *   • Helpers for prepared statements, queries, and transactions
 *
 * The database lives at `<userData>/vizcloud.db` and runs in WAL mode for
 * concurrent reader performance. Foreign keys are always enabled.
 */

import { app } from 'electron';
import Database, { type Database as BetterSqliteDatabase, type Statement } from 'better-sqlite3';
import { join } from 'path';

import { LoggerService } from '../core/logger.service';

import { LATEST_VERSION, MIGRATIONS } from './schema';

export class DatabaseService {
    private db: BetterSqliteDatabase | null = null;
    private readonly logger = new LoggerService('Database');

    /** Initialize a database file under the user's app-data directory. */
    public initialize(): void {
        if (this.db) {
            this.logger.warn('initialize() called twice; ignoring');
            return;
        }
        try {
            const dbPath = this.getDatabasePath();
            this.logger.info(`Opening database at: ${dbPath}`);
            this.db = new Database(dbPath);

            // WAL mode + practical pragmas. NORMAL synchronous is durable
            // enough for desktop while ~3× faster than FULL on rotational
            // disks. cache_size negative value is in KiB.
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('synchronous = NORMAL');
            this.db.pragma('cache_size = -64000');   // 64 MiB
            this.db.pragma('temp_store = MEMORY');
            this.db.pragma('foreign_keys = ON');

            this.runMigrations();

            this.logger.info('Database initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize database', error);
            throw error;
        }
    }

    /** Initialize against a custom path (used by tests with `:memory:`). */
    public initializeAt(path: string): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        this.db = new Database(path);
        this.db.pragma('foreign_keys = ON');
        this.runMigrations();
    }

    public get(): BetterSqliteDatabase {
        if (!this.db) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.db;
    }

    public prepare<TParams extends unknown[] = unknown[], TRow = unknown>(
        sql: string,
    ): Statement<TParams, TRow> {
        return this.get().prepare(sql) as Statement<TParams, TRow>;
    }

    public queryAll<TRow>(sql: string, ...params: unknown[]): TRow[] {
        return this.prepare<unknown[], TRow>(sql).all(...params);
    }

    public queryGet<TRow>(sql: string, ...params: unknown[]): TRow | undefined {
        return this.prepare<unknown[], TRow>(sql).get(...params);
    }

    public run(sql: string, ...params: unknown[]): Database.RunResult {
        return this.get().prepare(sql).run(...params);
    }

    /**
     * Run a function inside a transaction. `fn` may return any value; the
     * return value is propagated to the caller.
     */
    public transaction<T>(fn: () => T): T {
        return this.get().transaction(fn)();
    }

    public close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.logger.info('Database connection closed');
        }
    }

    public integrityCheck(): string {
        const row = this.get().prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined;
        return row?.integrity_check ?? 'unknown';
    }

    public getSize(): number {
        const row = this.get()
            .prepare('SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()')
            .get() as { size?: number } | undefined;
        return row?.size ?? 0;
    }

    public vacuum(): void {
        this.get().exec('VACUUM');
        this.logger.info('Database vacuumed');
    }

    /** Resolve the on-disk path for the production database. */
    private getDatabasePath(): string {
        return join(app.getPath('userData'), 'vizcloud.db');
    }

    /**
     * Apply every pending migration in version order. Each migration runs
     * inside its own transaction so a failure leaves the DB at the last
     * consistent version.
     */
    private runMigrations(): void {
        const db = this.get();
        const result = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
        const currentVersion = result?.user_version ?? 0;

        if (currentVersion >= LATEST_VERSION) {
            this.logger.debug(`Schema is up-to-date (v${currentVersion})`);
            return;
        }
        this.logger.info(`Migrating schema: v${currentVersion} → v${LATEST_VERSION}`);

        for (const migration of MIGRATIONS) {
            if (migration.version <= currentVersion) {
                continue;
            }
            this.logger.info(`Applying migration v${migration.version}: ${migration.description}`);
            db.transaction(() => {
                db.exec(migration.sql);
                db.pragma(`user_version = ${migration.version}`);
            })();
        }

        this.logger.info(`Schema migrated to v${LATEST_VERSION}`);
    }
}

// Singleton instance (consumed by services and IPC handlers).
export const databaseService = new DatabaseService();
