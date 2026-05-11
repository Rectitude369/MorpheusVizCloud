# Agent Handoff — VizCloud

**Hand-off from:** Cowork-mode agent (sandboxed, no local exec)
**Hand-off to:** Claude Code CLI (full local exec)
**Date:** 2026-05-09
**Branch:** main, version `1.0.0-alpha.1`
**Owner contact:** Chris Nelson — cnelson@rectitude369.com — McLoud, OK

---

## TL;DR for the next agent

Don't trust any "production-ready" wording from old docs. The codebase was just
rebuilt from a stub-with-pretty-sidebar into a functional pre-alpha across
seven bundles. **Your first job is to run the pipeline locally and report back
any errors I couldn't catch from a sandbox.** Do *not* start new feature work
until `npm run typecheck && npm run lint && npm run test` are clean.

The 13 immutable rules in `DEVELOPMENT.md` apply to every change you make.
Rule 11 in particular — never claim "done" or "100% complete" without earning
it.

## Read these in order, before touching code

1. `DEVELOPMENT.md` — the 13 immutable project rules. Non-negotiable.
2. `REVIEW.md` — the original deep-code-level audit (70 findings, severity-tagged).
3. `CURRENT_TASKS.md` — live status board, phase by phase.
4. `COMPLETION_REPORT.md` — honest "what's actually shipped" narrative.
5. This file (`HANDOFF.md`) — to find the unfinished bits.
6. `vizcloud-backlog.html` artifact in Cowork sidebar — interactive view of #2.

## Repo conventions you must respect

- **TypeScript strict mode is on** for all three projects (renderer, main,
  preload). `tsconfig.main.json` recently un-set `strictNullChecks: false`;
  do not regress.
- **No `any`**. ESLint enforces `@typescript-eslint/no-explicit-any: error`.
- **No absolute developer paths** in imports. ESLint enforces
  `no-restricted-imports` against `/Users/**`, `/home/**`, `C:\\**` patterns.
- **Renderer talks to main only via `window.vizcloud.invoke(channel, args)`**.
  Channel names live in `src/shared/ipc/contract.ts`. Adding a new IPC
  channel = update the contract first, then the handler in
  `src/main/core/ipc.handlers.ts`, then consume in the renderer.
- **No `child_process.exec("ssh ...")` ever.** All remote execution goes
  through `src/main/lib/ssh-client.ts` (`SshClient.runCommand([...argv])`).
  Never let user-controlled fields hit a local shell.
- **Snake↔camel boundary lives in `src/main/db/mappers.ts`.** Do not cast
  raw SQLite rows with `as Host[]`. Use the mappers.
- **No `setInterval` in services without a corresponding `clearInterval`
  in `shutdown()`.** Watch out: `tsx watch` skips `before-quit`; SIGINT/SIGTERM
  handlers in `main.ts` cover that.
- **Database migrations are append-only.** Never edit a shipped entry in
  `MIGRATIONS[]` in `src/main/db/schema.ts`. Add a new version.
- **CI is the gate.** `npm run typecheck && npm run lint && npm run test:coverage`
  must pass before you propose a merge. The matrix runs on
  macOS / Windows / Ubuntu via `.github/workflows/ci.yml`.

## First commands to run on the machine

```bash
cd ~/Desktop/Dev/VizCloud

# 1. Clean install — the existing node_modules (if any) is from a stale dep set
rm -rf node_modules
npm ci                              # uses the new package-lock.json (978 entries, peer-deps verified)

# 2. Native module rebuild for Electron 32
npx @electron/rebuild -f -w better-sqlite3,ssh2

# 3. Verify the new code I wrote compiles
npm run typecheck                   # all 3 configs
npm run lint                        # ESLint flat config
npm run test                        # unit tests (parsers, mappers, db, ssh-quote)

# 4. Boot it
npm run dev                         # main + renderer in watch mode

# 5. (Optional) end-to-end against built Electron
npm run build && npm run test:e2e
```

If any of steps 3–5 fail, fix them **before** taking on any new finding from
the backlog. The previous agent (me) couldn't run these from a sandbox so any
TypeScript / lint / test failure would be unverified.

## Known unknowns (status after 2026-05-09 verification pass)

The Claude Code CLI verification pass on 2026-05-09 ran the install /
typecheck / lint / test / build pipeline end-to-end. Status of the
original "known unknowns":

1. **`electron-window-state` import — VERIFIED.** The ESM-style
   `import windowStateKeeper from 'electron-window-state'` typechecks and
   builds cleanly under vite's CJS output for the main process.

2. **`MigrationState` enum usage — VERIFIED.** Compiles. As a side effect
   the verification pass discovered `VMState`/`HostStatus` enum-literal
   mismatches in `VMsPage.tsx` and `host.service.ts`; both fixed by using
   the enum members directly.

3. **`gatherHostFacts` SSH script — STILL UNTESTED against a real host.**
   The shell-chain bug (`&&` aborting on any non-zero exit) was fixed
   independently — script now uses `set +e ; … ; exit 0` so individual
   command failures yield empty sections rather than killing the probe.
   Live-host validation is the next step.

4. **`migrationsApi` bandwidth/dataProcessed fields — STILL INCOMPLETE.**
   Same as before: `parseMigrateVerbose` doesn't extract bandwidth lines.
   No code change this pass.

5. **Host-key TOFU UI prompt — STILL NOT WIRED.** Same as before. The
   `onUnknownHost` callback is still consumed only when the caller
   provides one, and no renderer surface does. First connect silently
   auto-trusts. Tracked as a follow-up.

6. **Playwright e2e — NOT RERUN this pass.** Native-module gymnastics
   ate the time budget; e2e re-run is the next agent's first job.

### macOS-specific install gotcha (newly surfaced)

The canonical project path is `/Users/cnelson/Library/CloudStorage/Dropbox/Mac (2)/Desktop/Dev/VizCloud`.
`(2)` confuses node-gyp's generated Makefile and breaks `better-sqlite3`'s
native build. Workaround: `npm ci --ignore-scripts`, then build
better-sqlite3 in `/tmp` and drop the `.node` back. See `CURRENT_TASKS.md`
"Verification commands" for the exact recipe. A permanent fix is to move
the project to a parens-free path or pre-stage prebuilt binaries for
Node 24 / arm64.

### 2026-05-09 — Phase 5 (auto-rehydration + Diagnostics + UI)

Landed in a single pass, validated against Chris's lab (atl-morph01/02/03):

- **Auto-discovery**: connect → schedule VM discovery (semaphore-throttled,
  max 4 concurrent, KeyedSerializer dedupes). At app boot, every host with
  `last_connected > 0` is queued through the same path so the UI populates
  without user clicks.
- **Diagnostics service** (`src/main/services/diagnostics.service.ts`):
  - `collectBundle(hostId)` — base64-uploads the embedded HPE collect.sh
    (v5, 13 Aug 2025) to `/tmp/vizcloud-collect.sh`, runs `bash` with
    `printf '1\\n\\n\\n'` pre-piped to stdin (auto-answers cleanup +
    SOS-report prompts the way MorphLogGrabber does), parses the
    `Output archive created:` line, base64-downloads the tar.gz to
    `<userData>/log-bundles/<hostname>_<archive>.tar.gz`, then
    `rm -f` on remote.
  - `startTail(hostId, source)` / `stopTail(hostId, source)` for any of
    morphd / pacemaker / corosync / pcsd / libvirtd / syslog.
  - Push events: `event:bundle-progress`, `event:log-line`.
- **UI overhauls**: ClustersPage, TopologyPage, DiagnosticsPage rewritten.
  ClustersPage shows quorum meter + member grid + DC marker. TopologyPage
  groups cluster members into a labeled shelf with a connecting ring.
  DiagnosticsPage replaces the static snapshot with a live diagnostic
  console — bundle progress, source-picker tail chips, saved-bundle list.

Known caveats:

- Live `tail -F` doesn't currently kill the remote process when the user
  stops it from the UI; the in-flight stream just stops being subscribed to.
  The remote `tail` exits when the SSH session closes (app quit). Adding a
  `streamCommandWithCancel` to `SshClient` is the cleaner fix — tracked but
  not blocking.
- The bundle collector uses base64-over-SSH for upload + download. Slower
  than native SFTP but avoids exposing `ssh2.Client` internals on the
  pooled wrapper. Fine for ~250 MB tarballs over a LAN.

### Newly surfaced production-build defect (fixed)

The previous build script `tsc -p tsconfig.main.json && tsc -p tsconfig.preload.json && vite build`
emitted main+preload artifacts at paths that didn't match
`package.json:main`. Consolidated on `vite build` (vite-plugin-electron
already builds main + preload + renderer in one pass). tsc is now
typecheck-only. `package.json:main` returns to `dist/main/main.js`.

## Unfinished items intentionally left for you

These are tracked in the backlog as `partial` or `todo`:

| ID | What's needed | Why deferred |
|---|---|---|
| `SEC-008` | Populate `MAC_CERT`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD`, `MAC_CERT_PASSWORD` GitHub repository secrets | Requires Apple Developer-ID cert + Apple ID — owner action |
| `SEC-008` (cont.) | Wire `electron-updater` against a chosen channel (GitHub Releases / S3 + signature) | Channel choice is a product decision |
| `REFACTOR-010` | Wire OpenTelemetry SDK to `subscribeToLogs()` fanout in `src/main/core/logger.service.ts` | Backend (Honeycomb? Splunk? Tempo?) is owner choice |
| `TEST-003` | Service-layer unit tests with `ssh2.Client` mocks (covers `HostService.connect`, `MigrationService.executeMigration` paths) | Pure modules covered; stateful mocks are next ratchet |

## Phase 5 backlog — explicitly deferred (innovation track)

Don't tackle these unless the owner specifically asks. Each is a project-sized
piece of work:

- `REFACTOR-002` Kysely / Drizzle migration
- `REFACTOR-004` push-based host telemetry agent (Go/Rust collector + mTLS WebSocket)
- `REFACTOR-005` electron-vite migration
- `REFACTOR-006` feature folders restructure
- `REFACTOR-007` Storybook + Chromatic
- `REFACTOR-011` WebGL force-graph topology view
- `REFACTOR-012` YAML-defined diagnostics rule engine
- `REFACTOR-013` Playbook engine (the `workflow_engine.py` reference)

## Architecture map you'll actually need

```
src/
├── main/                       Node / Electron main process (CommonJS at build)
│   ├── main.ts                 Lifecycle, single-instance lock, sandbox, window
│   ├── core/
│   │   ├── ipc.handlers.ts     Every IPC channel registered + zod-validated
│   │   └── logger.service.ts   electron-log wrapper + subscribeToLogs() fanout
│   ├── db/
│   │   ├── database.service.ts WAL, pragmas, migration runner
│   │   ├── schema.ts           MIGRATIONS[] — append-only
│   │   └── mappers.ts          snake_case row → camelCase domain object
│   ├── lib/
│   │   ├── ssh-client.ts       ssh2.Client pool + argv shellQuote + TOFU
│   │   └── parsers.ts          Pure parsers for /proc/* + virsh + pcs xml
│   └── services/
│       ├── host-repository.ts  Single source of truth for host row → Host
│       ├── host.service.ts     Connect / discover / poll / disconnect / saveConnection
│       ├── vm.service.ts       Discover + lifecycle (start/stop/reboot/...)
│       ├── cluster.service.ts  pcs status xml → Cluster
│       ├── migration.service.ts Streaming virsh migrate --verbose
│       └── metrics.service.ts  /proc/* with two-sample deltas
│
├── preload/
│   └── preload.ts              contextBridge exposes window.vizcloud
│
├── renderer/                   React 18 + RTK Query + Tailwind
│   ├── App.tsx                 Routes + ErrorBoundary + Suspense
│   ├── index.tsx               Provider + BrowserRouter + Toaster + event-bridge.ts
│   ├── preload.d.ts            Window augmentation for window.vizcloud
│   ├── components/
│   │   ├── atoms/              StatusBadge, LoadingSpinner, Modal, ErrorBoundary, ...
│   │   ├── molecules/          DataCard, ResourceMetrics, TimelineItem, ...
│   │   ├── organisms/          HostSummary, ClusterSummary
│   │   └── layout/             Sidebar (uiSlice-driven), Header
│   ├── lib/
│   │   ├── format.ts           formatBytes / formatDuration / formatRelativeTime
│   │   └── event-bridge.ts     Patches RTK caches from main-process push events
│   ├── pages/                  Dashboard, Hosts, VMs, Clusters, Migration, Storage,
│   │                           Diagnostics, Topology, Settings — all wired to RTK Query
│   ├── store/
│   │   ├── index.ts            configureStore with all 5 RTK Query slices + uiSlice
│   │   ├── hooks.ts            Typed useAppDispatch / useAppSelector
│   │   ├── slices/uiSlice.ts   Persisted via localStorage middleware
│   │   └── api/
│   │       ├── ipcBaseQuery.ts custom BaseQueryFn over window.vizcloud.invoke
│   │       ├── hostsApi.ts     tagTypes: ['Host', 'HostConnection']
│   │       ├── vmsApi.ts       tagTypes: ['VM', 'Host']
│   │       ├── clustersApi.ts  tagTypes: ['Cluster']
│   │       ├── migrationsApi.ts tagTypes: ['Migration', 'VM']
│   │       └── metricsApi.ts   tagTypes: ['Metrics']
│   └── styles/
│       ├── globals.css         RGB-triplet :root tokens + @tailwind directives
│       └── theme.ts            (informational — Tailwind reads CSS vars now)
│
└── shared/
    ├── types/index.ts          Domain entities (Host, VM, Cluster, Migration, ...)
    └── ipc/contract.ts         IPC_CHANNELS + IpcMap + IpcEventPayloads + VizCloudApi
```

## Build / package configs

- `tsconfig.json` — base, points all three project configs.
- `tsconfig.app.json` — renderer (jsx, browser libs).
- `tsconfig.main.json` — main process (CommonJS, Node types).
- `tsconfig.preload.json` — preload (CommonJS, browser-ish).
- `vite.config.ts` — three entries: main + preload + renderer; main + preload
  output as CJS into `dist/main/` + `dist/main/preload/`.
- `vitest.config.ts` — coverage thresholds 60% lines/statements/functions, 50%
  branches. Ratchet up via PR; never down.
- `playwright.config.ts` — uses `_electron.launch()`, not a Vite browser tab.
- `eslint.config.js` — flat config (ESLint v9), `typescript-eslint` v8.
- `tailwind.config.js` — RGB-triplet tokens via CSS variables.
- `build/after-pack.cjs` — flips Electron Fuses on packaged binary.
- `build/entitlements.mac.plist` — hardened runtime entitlements.
- `.github/workflows/ci.yml` — quality + e2e + signed package matrix.

## Patterns the next agent should know

### Adding a new IPC channel
1. Add a string entry to `IPC_CHANNELS` in `src/shared/ipc/contract.ts`.
2. Add a `[channel]: { req, res }` entry to `IpcMap`.
3. Implement the handler in `src/main/core/ipc.handlers.ts` using the `on()`
   helper — it registers with `ipcMain.handle` and surfaces typed errors.
4. Validate the input with a `zod` schema at the top of the handler.
5. Consume from the renderer by adding a builder in the relevant RTK Query
   slice using `ipcBaseQuery`.

### Adding a new schema migration
1. Append a new `Migration` to `MIGRATIONS[]` in `src/main/db/schema.ts`
   with `version: <next>` and a `sql` string.
2. Never edit an existing entry — even typo-fixes go in a new migration.
3. Run `npm run dev` once. The runner picks it up; `pragma user_version` is
   bumped after each migration in its own transaction.

### Adding a new SSH command
1. Use `client.runCommand(['cmd', 'arg1', 'arg2'])` — argv array.
2. If you must use a shell construct, wrap in `['sh', '-c', 'fixed script']`
   with no user-controlled interpolation in the script.
3. For long-running commands, use `client.streamCommand(argv, onLine)`.

### Adding a new push event
1. Add to `IPC_EVENTS` const in `src/shared/ipc/contract.ts`.
2. Add a payload shape to `IpcEventPayloads`.
3. Emit from main with `for (const win of BrowserWindow.getAllWindows())
   win.webContents.send(IPC_EVENTS.x, payload);`
4. Subscribe in `src/renderer/lib/event-bridge.ts` and dispatch
   `someApi.util.updateQueryData(...)`.

## Things to NOT touch without explicit owner approval (Rule 1)

- `DEVELOPMENT.md` — those 13 rules are immutable per the document itself.
- The shape of the IPC contract once a release is cut. Channel names + req/res
  shapes are an external contract for plugin authors.
- The `MIGRATIONS[]` array — append only.
- The encrypted `password_blob` column — changing the encryption scheme means
  a forced re-onboarding for every saved host.

## What I left in a "good enough for alpha" state

Things that work but could be richer:

- **`src/main/services/host.service.ts:gatherHostFacts`** — single-shot
  facts collection; doesn't yet pull MAC address, NIC list, datacenter.
- **`src/main/services/migration.service.ts:preflight`** — only checks target
  online + memory. Should also check shared-storage reachability + CPU model
  compatibility for `--live`.
- **`src/main/services/vm.service.ts:discoverOne`** — uses `virsh dominfo`
  + `vcpucount` + `domblklist --details` + `domiflist`. Doesn't yet parse
  full `dumpxml --inactive` for accurate disk capacity / format / backing
  files.
- **`src/renderer/pages/TopologyPage.tsx`** — radial SVG; capped at 8
  visible VMs per host. WebGL upgrade is REFACTOR-011.
- **`src/renderer/pages/DiagnosticsPage.tsx`** — host snapshot only.
  YAML rule engine is REFACTOR-012.

## Tests of mine that exist and should pass

```
tests/
├── setup.ts                                 jsdom + electron-mock + window.electron stub
├── unit/
│   ├── components/atoms/
│   │   ├── StatusBadge.test.tsx             pre-existing; verify still passes
│   │   ├── LoadingSpinner.test.tsx          pre-existing
│   │   └── (DataCard.test.tsx — pre-existing in molecules path? double-check)
│   ├── db/
│   │   ├── database.service.test.ts         in-memory SQLite + migration runner
│   │   └── mappers.test.ts                  rowToHost / rowToVm / etc.
│   └── lib/
│       ├── parsers.test.ts                  parseUptime / parseDominfo / parseMeminfo /
│       │                                    parseDiskstats / parseNetDev / parsePcsStatusXml
│       └── ssh-client.test.ts               shellQuote correctness (the most important)
└── (no integration/ folder yet — TEST-003 is partial)
```

`tests/unit/components/molecules/DataCard.test.tsx` is the file you'll see
referenced by old globs; it pre-dates this remediation pass — verify it
still passes against the current `DataCard` props. If it breaks, the fix
should be small.

## Where the artifacts live

- `REVIEW.md` — the audit, with file:line citations.
- `CURRENT_TASKS.md` — phase-by-phase status.
- `COMPLETION_REPORT.md` — honest narrative.
- `vizcloud-backlog.html` (in Cowork sidebar — also at
  `<outputs>/vizcloud-backlog.html` if you need a copy) — interactive
  backlog with status pills, filters, CSV/Markdown export.

## Agent transition checklist (per Rule 9)

- [x] All 13 rules reviewed and understood (DEVELOPMENT.md).
- [x] Current task progress documented (CURRENT_TASKS.md, this file).
- [x] CURRENT_TASKS.md updated with latest status close to realtime.
- [x] No new rules added in this pass — I followed the existing 13.
- [x] Phase 5 features remain explicitly deferred.
- [x] Production-readiness honestly described as **pre-alpha** in all docs.
- [x] LICENSE present at repo root (MIT).
- [x] CI workflows shipped (`.github/workflows/ci.yml`,
      `.github/workflows/dependency-review.yml`).
- [x] Backlog artifact reflects current state.

## Outstanding open questions for the owner

If you (Chris) get a moment, the next agent will need answers to these so
their work isn't blocked:

1. **Auto-update channel.** GitHub Releases (free) vs. private S3 / Cloudfront
   (paid)? Affects `electron-updater` config.
2. **Telemetry backend.** OpenTelemetry collector endpoint — Honeycomb, Tempo,
   Splunk, or self-hosted Jaeger?
3. **Code-signing.** Existing Apple Developer ID + Team ID? Existing Windows
   EV cert (or buy new)?
4. **Target Linux distros.** Currently shipping `.AppImage` + `.deb`. Need
   `.rpm` for Rocky / RHEL? `.snap` for Ubuntu Pro?
5. **Multi-tenancy in Phase 5 (REFACTOR-013 playbook engine).** Per-host
   role-based access, or single-operator?

---

**One more thing for the next agent.** Read `REVIEW.md` end-to-end before
your first commit. The audit is the canonical context for *why* the codebase
looks the way it does. Without that context, you'll be tempted to "improve"
patterns that exist for specific reasons (e.g., the `subscribeToLogs()` hook
in `logger.service.ts` is intentional scaffolding for the OTel wiring —
don't delete it as "unused").

Welcome aboard. The user values quality, innovation, and honest progress
reporting. They will read your commit messages — make them count.
