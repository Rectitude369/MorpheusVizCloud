/**
 * Lightweight async semaphore.
 *
 * Used to cap the number of in-flight SSH-heavy operations against managed
 * hosts so that bulk actions (auto-discover at startup, mass refresh) don't
 * saturate the laptop's TCP table or the target hosts' SSH daemons.
 *
 * Pattern:
 *   const sem = new Semaphore(4);
 *   await sem.run(() => doSomethingExpensive());
 *
 * Optionally, a `keys` constructor arg restricts re-entrancy: at most one
 * task per key may run concurrently, regardless of overall capacity. This
 * is what the host-discovery scheduler uses to avoid double-discovery on
 * the same host.
 */

type Releaser = () => void;

export class Semaphore {
    private inflight = 0;
    private readonly waiters: Array<(release: Releaser) => void> = [];

    constructor(private readonly max: number) {
        if (max < 1) throw new Error('Semaphore max must be >= 1');
    }

    /** Acquire a slot; returns a release function. Always release in `finally`. */
    public acquire(): Promise<Releaser> {
        if (this.inflight < this.max) {
            this.inflight += 1;
            return Promise.resolve(this.makeRelease());
        }
        return new Promise<Releaser>((resolve) => {
            this.waiters.push(resolve);
        });
    }

    /** Run `fn` under a semaphore slot. Result/exception is propagated. */
    public async run<T>(fn: () => Promise<T>): Promise<T> {
        const release = await this.acquire();
        try {
            return await fn();
        } finally {
            release();
        }
    }

    private makeRelease(): Releaser {
        let released = false;
        return (): void => {
            if (released) return;
            released = true;
            const next = this.waiters.shift();
            if (next) {
                // Hand the slot to the next waiter without bumping inflight count.
                next(this.makeRelease());
            } else {
                this.inflight -= 1;
            }
        };
    }
}

/**
 * Per-key serializer: at most one task per key runs at a time. Layered on
 * top of (or independent from) Semaphore. Used to coalesce duplicate
 * discovery requests for the same host.
 */
export class KeyedSerializer {
    private readonly active = new Map<string, Promise<unknown>>();

    public run<T>(key: string, fn: () => Promise<T>): Promise<T> {
        const existing = this.active.get(key);
        if (existing) {
            // Coalesce — return the in-flight result instead of starting a
            // duplicate task. Callers that need a fresh run should pass a
            // unique key.
            return existing as Promise<T>;
        }
        const promise = (async (): Promise<T> => {
            try {
                return await fn();
            } finally {
                this.active.delete(key);
            }
        })();
        this.active.set(key, promise);
        return promise;
    }

    public has(key: string): boolean {
        return this.active.has(key);
    }
}
