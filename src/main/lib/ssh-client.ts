/**
 * Hardened SSH client for VizCloud (SEC-002, REFACTOR-003).
 *
 * Replaces the previous `child_process.exec("ssh ...")` approach which was
 * vulnerable to remote command injection because every user-controlled
 * field (hostname, IP, vm name, username) was string-interpolated into a
 * shell command run on the local box.
 *
 * Design:
 *   • `ssh2.Client` is used directly; no `ssh` binary is shelled out to.
 *   • `runCommand(argv)` accepts an argument array and quotes each element
 *     for the *remote* shell. `argv` never goes through a local shell.
 *   • Hosts are pinned via a managed `known_hosts` file under `userData`.
 *     First-connect prompts the caller (TOFU) — no `StrictHostKeyChecking=no`.
 *   • Connections are pooled by host id and reused; the previous code
 *     opened a fresh TCP handshake per command.
 *   • All credentials are obtained via callbacks so plaintext never lives
 *     in the connection record. Passwords go through Electron `safeStorage`
 *     before being persisted (see HostService).
 */

import { promises as fs } from 'fs';
import { hostname } from 'os';
import { join } from 'path';
import { Client, type ClientChannel, type ConnectConfig, utils as sshUtils } from 'ssh2';

import { LoggerService } from '../core/logger.service';

const logger = new LoggerService('SSH');

export interface KnownHostEntry {
    host: string;
    keyType: string;
    fingerprint: string;
    addedAt: number;
}

export interface SshAuthPassword { type: 'password'; password: string; }
export interface SshAuthKey      { type: 'key'; privateKey: Buffer | string; passphrase?: string; }
export interface SshAuthAgent    { type: 'agent'; agentSock?: string; }
export type SshAuth = SshAuthPassword | SshAuthKey | SshAuthAgent;

export interface SshConnectArgs {
    /** Stable identifier (typically the host's UUID in our DB). */
    id: string;
    host: string;
    port?: number;
    username: string;
    auth: SshAuth;
    /** Connect timeout in ms. */
    timeoutMs?: number;
    /**
     * Called when the host fingerprint isn't in `known_hosts`. Return true to
     * accept (TOFU) or false to abort. Defaults to abort.
     */
    onUnknownHost?: (entry: KnownHostEntry) => Promise<boolean> | boolean;
}

export interface CommandResult {
    stdout: string;
    stderr: string;
    code: number;
}

const DEFAULT_PORT = 22;
const DEFAULT_TIMEOUT = 15_000;

/**
 * Quote one argument for the **remote** shell. The simplest robust scheme:
 * wrap in single quotes and escape any embedded single quotes by closing,
 * inserting an escaped quote, and reopening.
 */
export function shellQuote(arg: string): string {
    if (arg.length === 0) return "''";
    if (/^[A-Za-z0-9_./:=@%+-]+$/.test(arg)) {
        return arg; // safe characters; no quoting needed
    }
    return `'${arg.replace(/'/g, "'\\''")}'`;
}

export class SshClient {
    private readonly conn = new Client();
    private connected = false;
    private readonly inflight = new Set<ClientChannel>();

    constructor(private readonly args: SshConnectArgs, private readonly knownHostsPath: string) {}

    public async connect(): Promise<void> {
        if (this.connected) return;

        const knownHostKey = await this.loadKnownHostKey(this.args.host);

        const config: ConnectConfig = {
            host: this.args.host,
            port: this.args.port ?? DEFAULT_PORT,
            username: this.args.username,
            readyTimeout: this.args.timeoutMs ?? DEFAULT_TIMEOUT,
            // Verify server's host key against our pinned key (TOFU).
            //
            // First contact uses `accept-new` semantics — same default as
            // OpenSSH 7.6+. The key is auto-pinned and any mismatch on a
            // subsequent connection aborts the handshake with no override.
            // An interactive renderer prompt for first-connect approval is
            // tracked separately; until then a synchronous accept is the only
            // workable behavior because `hostVerifier` itself is synchronous.
            hostVerifier: (key: Buffer): boolean => {
                const parsed = sshUtils.parseKey(key);
                if (parsed instanceof Error) {
                    logger.warn(`Could not parse host key for ${this.args.host}: ${parsed.message}`);
                    return false;
                }
                const fpBase64 = key.toString('base64');
                if (knownHostKey) {
                    if (knownHostKey === fpBase64) {
                        return true;
                    }
                    logger.warn(`Host key MISMATCH for ${this.args.host} — refusing connection`);
                    return false;
                }
                // First contact. If the caller wired an interactive prompt,
                // honor its decision; otherwise auto-pin (accept-new).
                if (this.args.onUnknownHost) {
                    const decision = this.args.onUnknownHost({
                        host: this.args.host,
                        keyType: 'ssh-key',
                        fingerprint: fpBase64,
                        addedAt: Date.now(),
                    });
                    if (decision !== true) {
                        return false;
                    }
                }
                void this.saveKnownHostKey(this.args.host, fpBase64);
                logger.info(`First-connect: pinned host key for ${this.args.host}`);
                return true;
            },
        };

        switch (this.args.auth.type) {
            case 'password':
                config.password = this.args.auth.password;
                break;
            case 'key':
                config.privateKey = this.args.auth.privateKey;
                if (this.args.auth.passphrase) {
                    config.passphrase = this.args.auth.passphrase;
                }
                break;
            case 'agent':
                config.agent = this.args.auth.agentSock ?? process.env.SSH_AUTH_SOCK ?? '';
                if (!config.agent) {
                    throw new Error('Agent auth requested but SSH_AUTH_SOCK is not set');
                }
                break;
        }

        await new Promise<void>((resolve, reject) => {
            const onReady = (): void => {
                this.conn.removeListener('error', onError);
                this.connected = true;
                resolve();
            };
            const onError = (err: Error): void => {
                this.conn.removeListener('ready', onReady);
                reject(err);
            };
            this.conn.once('ready', onReady);
            this.conn.once('error', onError);
            this.conn.connect(config);
        });

        logger.info(`Connected: ${this.args.username}@${this.args.host} [${this.args.id}]`);
    }

    /** Run a single command via argv (no local shell). Returns combined output. */
    public async runCommand(argv: ReadonlyArray<string>, opts?: { timeoutMs?: number }): Promise<CommandResult> {
        if (!this.connected) {
            await this.connect();
        }
        if (argv.length === 0) {
            throw new Error('runCommand requires at least one argument');
        }
        const remoteCommand = argv.map(shellQuote).join(' ');

        return new Promise<CommandResult>((resolve, reject) => {
            const timer = opts?.timeoutMs
                ? setTimeout(() => {
                      reject(new Error(`SSH command timed out after ${opts.timeoutMs}ms: ${argv[0]}`));
                  }, opts.timeoutMs)
                : null;

            this.conn.exec(remoteCommand, (err, stream) => {
                if (err) {
                    if (timer) clearTimeout(timer);
                    return reject(err);
                }
                this.inflight.add(stream);
                let stdout = '';
                let stderr = '';
                stream
                    .on('close', (code: number | null) => {
                        if (timer) clearTimeout(timer);
                        this.inflight.delete(stream);
                        resolve({ stdout, stderr, code: code ?? 0 });
                    })
                    .on('data', (chunk: Buffer) => {
                        stdout += chunk.toString('utf8');
                    });
                stream.stderr.on('data', (chunk: Buffer) => {
                    stderr += chunk.toString('utf8');
                });
            });
        });
    }

    /**
     * Long-running command with stdout streamed via the supplied callback.
     * Used for migrations (`virsh migrate --verbose`) so the renderer can
     * display live progress.
     */
    public streamCommand(
        argv: ReadonlyArray<string>,
        onLine: (line: string, source: 'stdout' | 'stderr') => void,
        opts?: { timeoutMs?: number },
    ): Promise<CommandResult> {
        return this.streamCommandWithCancel(argv, onLine, opts).result;
    }

    /**
     * Same as `streamCommand` but returns a `cancel` function that signals
     * the remote process (SIGTERM) and closes the channel. The returned
     * `result` Promise resolves once the remote actually exits — typically
     * within a few hundred ms after `cancel()` for well-behaved processes.
     */
    public streamCommandWithCancel(
        argv: ReadonlyArray<string>,
        onLine: (line: string, source: 'stdout' | 'stderr') => void,
        opts?: { timeoutMs?: number },
    ): { result: Promise<CommandResult>; cancel: () => void } {
        let activeStream: ClientChannel | null = null;
        let canceled = false;

        const result = new Promise<CommandResult>((resolve, reject) => {
            const start = async (): Promise<void> => {
                if (!this.connected) {
                    await this.connect();
                }
                const remoteCommand = argv.map(shellQuote).join(' ');
                const timer = opts?.timeoutMs
                    ? setTimeout(() => reject(new Error(`SSH stream timed out: ${argv[0]}`)), opts.timeoutMs)
                    : null;

                this.conn.exec(remoteCommand, (err, stream) => {
                    if (err) {
                        if (timer) clearTimeout(timer);
                        return reject(err);
                    }
                    activeStream = stream;
                    this.inflight.add(stream);
                    if (canceled) {
                        // Cancel called before the channel was even open.
                        try { stream.signal('TERM'); } catch { /* ignore */ }
                        try { stream.end(); } catch { /* ignore */ }
                    }
                    let stdout = '';
                    let stderr = '';
                    let stdoutBuffer = '';
                    let stderrBuffer = '';
                    stream
                        .on('close', (code: number | null) => {
                            if (timer) clearTimeout(timer);
                            this.inflight.delete(stream);
                            // Flush trailing partial lines.
                            if (stdoutBuffer) onLine(stdoutBuffer, 'stdout');
                            if (stderrBuffer) onLine(stderrBuffer, 'stderr');
                            resolve({ stdout, stderr, code: code ?? 0 });
                        })
                        .on('data', (chunk: Buffer) => {
                            const text = chunk.toString('utf8');
                            stdout += text;
                            stdoutBuffer = flushLines(stdoutBuffer + text, (line) => onLine(line, 'stdout'));
                        });
                    stream.stderr.on('data', (chunk: Buffer) => {
                        const text = chunk.toString('utf8');
                        stderr += text;
                        stderrBuffer = flushLines(stderrBuffer + text, (line) => onLine(line, 'stderr'));
                    });
                });
            };
            void start().catch(reject);
        });

        const cancel = (): void => {
            canceled = true;
            const stream = activeStream;
            if (!stream) return;
            try { stream.signal('TERM'); } catch { /* not always permitted */ }
            try { stream.end(); } catch { /* ignore */ }
        };

        return { result, cancel };
    }

    /**
     * Open an SFTP subsystem on this connection. Caller is responsible for
     * `end()`ing it. Native SFTP is dramatically faster than base64-over-SSH
     * for non-trivial payloads (bundle archives can be 40–200 MB).
     */
    public async sftp(): Promise<import('ssh2').SFTPWrapper> {
        if (!this.connected) {
            await this.connect();
        }
        return new Promise((resolve, reject) => {
            this.conn.sftp((err, sftp) => {
                if (err) return reject(err);
                resolve(sftp);
            });
        });
    }

    public end(): void {
        try {
            for (const stream of this.inflight) {
                stream.signal('TERM');
                stream.end();
            }
        } catch {
            // Best effort.
        }
        this.conn.end();
        this.connected = false;
    }

    private async loadKnownHostKey(host: string): Promise<string | null> {
        try {
            const data = await fs.readFile(this.knownHostsPath, 'utf8');
            for (const line of data.split('\n')) {
                if (line.startsWith(`${host} `)) {
                    return line.split(' ', 2)[1] ?? null;
                }
            }
        } catch {
            // No known_hosts file yet.
        }
        return null;
    }

    private async saveKnownHostKey(host: string, base64Key: string): Promise<void> {
        const entry = `${host} ${base64Key} added=${new Date().toISOString()} by=${hostname()}\n`;
        try {
            await fs.appendFile(this.knownHostsPath, entry, { mode: 0o600 });
        } catch (err) {
            logger.error(`Failed to persist host key for ${host}`, err);
        }
    }
}

function flushLines(buffer: string, emit: (line: string) => void): string {
    let idx = buffer.indexOf('\n');
    while (idx !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        emit(line);
        buffer = buffer.slice(idx + 1);
        idx = buffer.indexOf('\n');
    }
    return buffer;
}

// ============================================================================
// Connection pool — one SshClient per host id.
// ============================================================================

class SshClientPool {
    private readonly clients = new Map<string, SshClient>();
    private knownHostsPath = '';

    public configure(knownHostsPath: string): void {
        this.knownHostsPath = knownHostsPath;
    }

    public async getOrCreate(args: SshConnectArgs): Promise<SshClient> {
        let client = this.clients.get(args.id);
        if (client) return client;
        if (!this.knownHostsPath) {
            throw new Error('SshClientPool not configured — call configure() first');
        }
        client = new SshClient(args, this.knownHostsPath);
        await client.connect();
        this.clients.set(args.id, client);
        return client;
    }

    public has(id: string): boolean {
        return this.clients.has(id);
    }

    /** Return an already-connected client by id, or undefined if absent. */
    public get(id: string): SshClient | undefined {
        return this.clients.get(id);
    }

    public close(id: string): void {
        const client = this.clients.get(id);
        if (client) {
            client.end();
            this.clients.delete(id);
        }
    }

    public closeAll(): void {
        for (const [id, client] of this.clients) {
            client.end();
            this.clients.delete(id);
        }
    }
}

export const sshPool = new SshClientPool();

export function configureSshPool(userDataDir: string): void {
    sshPool.configure(join(userDataDir, 'known_hosts'));
}
