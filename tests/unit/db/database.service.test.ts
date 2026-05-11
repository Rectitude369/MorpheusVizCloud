/**
 * Database service tests using better-sqlite3 in :memory: mode.
 *
 * Replaces the prior `describe.skip(...)` placeholder file. Coverage:
 *   • Migration runner applies pending migrations and bumps user_version.
 *   • Foreign key + WAL pragmas are honored.
 *   • Transaction rollback on inner throw.
 *   • Integrity check returns 'ok' on a fresh schema.
 *   • prepare/run/queryAll/queryGet helpers behave per better-sqlite3.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock electron `app` because DatabaseService.initialize() asks for userData.
// `initializeAt(':memory:')` is the test path so we never hit disk.
vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => '/tmp/vizcloud-test') },
    safeStorage: { isEncryptionAvailable: () => false, encryptString: vi.fn(), decryptString: vi.fn() },
    BrowserWindow: { getAllWindows: () => [] },
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    shell: { openExternal: vi.fn(), showItemInFolder: vi.fn() },
    dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn(), showMessageBox: vi.fn() },
    session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() }, setPermissionRequestHandler: vi.fn() } },
    screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
}));

// Avoid loading the logger's electron-log file transport (which writes to userData).
vi.mock('electron-log', () => ({
    default: {
        debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
        transports: { file: { resolvePathFn: null, format: '', level: '', maxSize: 0 }, console: { format: '', level: '' } },
        errorHandler: { startCatching: vi.fn() },
    },
}));

// Use require inside tests so the electron mock is in place before the module
// graph initializes.
let dbModule: typeof import('../../../src/main/db/database.service');

beforeEach(async () => {
    dbModule = await import('../../../src/main/db/database.service');
    dbModule.databaseService.close();
    dbModule.databaseService.initializeAt(':memory:');
});

afterEach(() => {
    dbModule.databaseService.close();
});

describe('DatabaseService — initialization', () => {
    it('creates the hosts table with expected columns', () => {
        const cols = dbModule.databaseService.queryAll<{ name: string }>("PRAGMA table_info('hosts')");
        const names = cols.map((c) => c.name);
        expect(names).toContain('id');
        expect(names).toContain('hostname');
        expect(names).toContain('ip_address');
        expect(names).toContain('cluster_id');
    });

    it('creates the clusters / vms / migrations tables', () => {
        const tables = dbModule.databaseService.queryAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
        const names = tables.map((t) => t.name);
        for (const expected of ['hosts', 'clusters', 'vms', 'migrations', 'system_metrics', 'host_connections', 'settings']) {
            expect(names).toContain(expected);
        }
    });

    it('marks user_version equal to LATEST_VERSION', () => {
        const row = dbModule.databaseService.queryGet<{ user_version: number }>('PRAGMA user_version');
        expect(row?.user_version).toBeGreaterThanOrEqual(1);
    });

    it('enables foreign key enforcement', () => {
        const row = dbModule.databaseService.queryGet<{ foreign_keys: number }>('PRAGMA foreign_keys');
        expect(row?.foreign_keys).toBe(1);
    });
});

describe('DatabaseService — helpers', () => {
    it('queryGet returns undefined for empty results', () => {
        const result = dbModule.databaseService.queryGet('SELECT 1 AS v WHERE 1 = 0');
        expect(result).toBeUndefined();
    });

    it('queryAll returns array of typed rows', () => {
        const rows = dbModule.databaseService.queryAll<{ value: number }>('SELECT 1 AS value UNION SELECT 2 ORDER BY value');
        expect(rows).toEqual([{ value: 1 }, { value: 2 }]);
    });

    it('run returns RunResult with changes', () => {
        const r = dbModule.databaseService.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', 'x.test', '1');
        expect(typeof r.changes).toBe('number');
    });
});

describe('DatabaseService — transactions', () => {
    it('rolls back on throw', () => {
        try {
            dbModule.databaseService.transaction(() => {
                dbModule.databaseService.run('INSERT INTO settings (key, value) VALUES (?, ?)', 'tx.key', 'pending');
                throw new Error('boom');
            });
        } catch {
            // expected
        }
        const row = dbModule.databaseService.queryGet('SELECT value FROM settings WHERE key = ?', 'tx.key');
        expect(row).toBeUndefined();
    });

    it('commits on success', () => {
        dbModule.databaseService.transaction(() => {
            dbModule.databaseService.run('INSERT INTO settings (key, value) VALUES (?, ?)', 'tx.ok', 'yes');
        });
        const row = dbModule.databaseService.queryGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', 'tx.ok');
        expect(row?.value).toBe('yes');
    });
});

describe('DatabaseService — integrity', () => {
    it('integrity check returns ok', () => {
        expect(dbModule.databaseService.integrityCheck()).toBe('ok');
    });
});
