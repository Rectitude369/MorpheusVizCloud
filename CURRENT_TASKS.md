# VizCloud — Live Status Board

**Project Status:** PRE-ALPHA — architectural rewrite complete; awaiting first
local verification run by next agent (Claude Code CLI).
**Last Updated:** 2026-05-09
**Build:** 1.0.0-alpha.1
**Last agent:** Cowork-mode (sandboxed; could not run install/build/test locally)
**Next agent:** Claude Code CLI (full local exec) — start with
[`HANDOFF.md`](HANDOFF.md), then run the verification commands below.

> Honest snapshot per Rule 11. The "100% complete" claims in earlier
> versions of this document and `COMPLETION_REPORT.md` were inaccurate;
> the project was an architectural skeleton with non-functional pages
> and a database schema that failed to compile. The remediation tracked
> here brings VizCloud to genuine alpha.
>
> Live, filterable view: open the `vizcloud-review-backlog` artifact in
> the Cowork sidebar.

---

## Phase 0 — Hygiene & honest baseline ✅

- [x] Hardcoded developer absolute path imports removed (`@shared/types` everywhere).
- [x] `RootState`, `useAppSelector`, `useAppDispatch` properly typed.
- [x] Duplicate `common/` components deleted; ErrorBoundary moved to `atoms/`.
- [x] `index.html` `id="root"` matches `index.tsx`.
- [x] `tsconfig.main.json` no longer waives strict mode; `npm run typecheck` covers all three configs.
- [x] Single ESLint flat config; legacy `.eslintrc.json` removed; missing plugins added to `package.json`.
- [x] `LoggerService(source)` actually uses the source; `globalThis.app` leak removed.
- [x] `requestSingleInstanceLock()`; `app.enableSandbox()` runs unconditionally.
- [x] Window position math clamped for multi-monitor / portrait setups.
- [x] `i18n.ts` removed (unused — reintroduce when localization is genuinely scoped).
- [x] LICENSE added; SPDX headers next pass.

## Phase 1 — Make-it-run ✅

- [x] `tailwind.config.js` + `postcss.config.js` + RGB-triplet token system in `globals.css`.
- [x] `src/preload/preload.ts` exposes a typed `window.vizcloud` via `contextBridge`.
- [x] Shared IPC contract (`src/shared/ipc/contract.ts`) drives main, preload, and renderer.
- [x] Custom `ipcBaseQuery` replaces `fetchBaseQuery` across all five RTK Query slices.
- [x] All five RTK Query slices register in the store with `tagTypes` + `providesTags` / `invalidatesTags`.
- [x] `setupListeners(store.dispatch)` enables `refetchOnFocus` + `refetchOnReconnect`.
- [x] `event-bridge.ts` patches RTK Query caches from main-process push events
  (`event:host-status`, `event:vm-state-changed`, `event:migration-progress`,
  `event:metrics-tick`).
- [x] SQLite schema rewritten: separate `CREATE INDEX` statements; ordered tables; FK references resolve at parse time.
- [x] DB migration runner (`MIGRATIONS[]`); `pragma user_version` honored; in-memory test path (`initializeAt`).
- [x] Strict CSP via `webRequest.onHeadersReceived` on `defaultSession`.
- [x] `will-navigate` / `will-frame-navigate` / `will-attach-webview` allow only the dev server origin or packaged file://.
- [x] Deny-all permission-request-handler.
- [x] `process.env` IPC handler removed (was a leak vector).

## Phase 2 — Service layer hardening ✅

- [x] `src/main/lib/ssh-client.ts` — `ssh2.Client`-based pooled connections.
  Argv-style `runCommand([...])` + remote-side `shellQuote` → no local-shell
  injection vector.
- [x] `known_hosts` (TOFU) replaces `StrictHostKeyChecking=no`.
- [x] Stop hardcoding `root@`; honor connection.username throughout. *(Initial pass missed `migration.service.ts:194` — fixed 2026-05-09 by Claude Code CLI; the migrate URI now reads the target host's saved username.)*
- [x] `safeStorage` for password credentials (BLOB column `password_blob`); `password_hash` removed from schema.
- [x] `INSERT … ON CONFLICT DO UPDATE` with named bindings (Bag-of-29-positional-? bug eliminated).
- [x] `rowToHost`/`rowToVm`/`rowToCluster`/`rowToMigration`/`rowToHostConnection`/`rowToMetrics` mappers (snake↔camel).
- [x] `parseDomblklist` / `parseDomiflist` use `split(/\s+/)` and consume real virsh column output.
- [x] `parseUptime` handles weeks/days/hours/minutes/seconds.
- [x] `parsePcsStatusXml` derives quorum + DC from structured XML (no more "Daemons Online" false matches).
- [x] Cluster status derived from `with_quorum` + node enumeration.
- [x] `MigrationService` streams `virsh migrate --verbose` and emits per-progress events.
- [x] Per-VM concurrency lock; pre-flight checks (capacity, target online); rollback on partial failure.
- [x] `migrate-cancel` uses libvirt domain name (not VizCloud's internal UUID).
- [x] `MetricsService` parses /proc/stat + /proc/meminfo + /proc/diskstats + /proc/net/dev with two-sample deltas.
- [x] Daily retention sweep replaces per-write DELETE.
- [x] `HostRepository` dedupes the previously-quadruplicated `getHost`.
- [x] All services emit IPC events; the renderer's event-bridge keeps RTK caches live.

## Phase 3 — Vertical completion (pages) ✅

- [x] `DashboardPage` — real KPIs from `useGetHostsQuery` / `useGetVMsQuery` / `useGetClustersQuery` / `useGetActiveMigrationsQuery`. No more hardcoded `0` / `+2`.
- [x] `HostsPage` — list, Add Host modal (agent / key / password auth, password encrypted via safeStorage), discover VMs button, delete.
- [x] `VMsPage` — list with full lifecycle ops (start, shutdown, reboot, reset, suspend, resume, force-off) gated by current state.
- [x] `ClustersPage` — discover via online host; list with status, quorum, master.
- [x] `MigrationPage` — start (live/cold), live progress bar driven by IPC events, cancel, history.
- [x] `SettingsPage` — read/write `settings` table.
- [x] `StoragePage` — per-host capacity + utilization bars.
- [x] `DiagnosticsPage` — per-host diagnostics summary.
- [x] `TopologyPage` — SVG topology view (WebGL upgrade tracked as REFACTOR-011).
- [x] `Sidebar` honors persisted `sidebarCollapsed`; `Header` honors search query slice.
- [x] `localStorage` persists UI preferences (sidebar state, theme, last-selected ids).

## Phase 4 — Hardening & release readiness 🟡

- [x] `app.enableSandbox()` unconditional.
- [x] CSP, X-Content-Type-Options, Referrer-Policy on all responses.
- [x] Electron Fuses scaffolded (`build/after-pack.cjs` flips RunAsNode, NodeOptionsEnv, NodeCliInspect, EmbeddedAsarIntegrity, OnlyLoadAppFromAsar, LoadBrowserProcessV8Snapshot, GrantFileProtocolExtraPrivileges).
- [x] macOS hardenedRuntime + entitlements (`build/entitlements.mac.plist`).
- [x] electron-window-state persists window bounds (REFACTOR-015).
- [x] Vitest coverage thresholds in CI (60% line baseline; ratchet up never down).
- [x] Playwright tests now exercise the actual Electron build via `_electron.launch()`.
- [x] GitHub Actions workflow (`ci.yml`): typecheck + lint + unit + e2e (mac/win/linux) + package on `main`.
- [x] `dependency-review.yml` blocks high-severity dependency advisories on PRs.
- [ ] **Code-signing credentials** — repo secrets (`MAC_CERT`, `APPLE_ID`, etc.)
  must be populated before signed/notarized builds work. App is not yet
  Gatekeeper-approved.
- [ ] **electron-updater wiring** — release channel (GitHub Releases / S3) and
  signature-verified update flow. Dependency installed; channel choice TBD.
- [ ] **OpenTelemetry observability** — `subscribeToLogs()` fanout exists in
  `logger.service.ts` (REFACTOR-010 scaffold); SDK + collector to be wired.

## Phase 5 — Auto-rehydration + Diagnostics + UI polish ✅

Landed 2026-05-09 by Claude Code CLI:

- [x] **Auto-discover VMs on host add** — `HostService.connect` schedules
  background discovery via a new semaphore + per-host serializer
  (`src/main/lib/semaphore.ts`). Cap: 4 concurrent host operations; duplicate
  requests for the same host coalesce.
- [x] **Auto-reconnect + auto-discover at launch** — `HostService.resumeKnownHosts()`
  walks `host_connections.last_connected > 0`, lazy-reconnects via the
  existing `ensureHostConnected` helper, and queues VM discovery through the
  same throttle.
- [x] **Diagnostics — log bundle collector** — port of HPE Support's
  `collect.sh` + MorphLogGrabber: SCP via base64-pipe, run with stdin
  pre-feed for the cleanup/SOS prompts, download via base64 pull, save to
  `<userData>/log-bundles/`. Surfaces progress events on
  `event:bundle-progress`. (`DiagnosticsService.collectBundle`.)
- [x] **Diagnostics — live log tail** — `tail -F` over SSH for any of
  morphd / pacemaker / corosync / pcsd / libvirtd / syslog, lines pushed via
  `event:log-line`.
- [x] **Clusters view** — gradient-accent cards, KPI tiles
  (online/VMs/cores/memory), quorum meter, member-list with DC marker.
  Display name no longer leaks the internal `pcs:hostA,hostB,hostC` key.
- [x] **Topology view** — clusters render as labeled rounded shelves with a
  soft ring connecting member hosts. VMs orbit each host; standalone hosts
  occupy a row below the cluster shelves.
- [x] **Diagnostics view** — per-host panel with KPIs, source-picker chips
  for live tails, bundle-collect button with phase + progress bar, saved
  bundles list with "Open folder".

### Pipeline state at landing

- typecheck: ✅ all 3 configs
- lint: ✅ 0 errors / 8 warnings (style-only)
- build: ✅ vite emits dist/main/main.js + dist/main/preload/preload.js + dist/renderer/
- test: ❌ 10 db.service tests fail under vitest because the embedded
  better-sqlite3 binary is built for Electron's NODE_MODULE_VERSION (128),
  not Node 24's (137). To re-run tests, swap with the Node prebuild
  (`cd node_modules/better-sqlite3 && npx prebuild-install`). Tests
  themselves pass with the right binary in place.

## Phase 6 — Polish + distributable builds ✅

Landed 2026-05-09 by Claude Code CLI:

- [x] **`streamCommandWithCancel`** on `SshClient` — proper SIGTERM + channel
  close on `cancel()`, so live `tail -F` actually exits remotely instead of
  just unsubscribing locally.
- [x] **Native SFTP** — `SshClient.sftp()` exposes the ssh2 SFTPWrapper.
  `DiagnosticsService.collectBundle` now uses `sftp.writeFile()` for
  upload and `sftp.fastGet()` for download (with `step` callbacks driving
  the renderer's progress bar). Replaces the slower base64-over-SSH path.
- [x] **Per-bundle actions** — Save-As (open native save dialog),
  Reveal-in-Finder/Explorer, Delete. Three new IPC channels;
  filename-validation guards path traversal.
- [x] **electron-updater** — channel-agnostic scaffolding via
  `UpdaterService`. Feed URL pulled from `updates.feedUrl` setting; default
  no-op so unsigned dev builds don't try to fetch updates. `setFeedURL` +
  `update-available` prompt + `downloadUpdate` flow all wired.

### Distributable builds shipped (unsigned)

```
release/VizCloud-1.0.0-alpha.1-arm64.dmg          (128 MB) — macOS installer
release/VizCloud-1.0.0-alpha.1-arm64-mac.zip      (128 MB) — macOS auto-update payload
release/VizCloud Setup 1.0.0-alpha.1.exe          (115 MB) — Windows NSIS installer
release/VizCloud 1.0.0-alpha.1.exe                ( 99 MB) — Windows portable EXE
```

Code signing remains gated on the user-supplied repo secrets — see README
"Code signing (currently unsigned)" section.

### Still deferred

- **Service-layer unit tests with ssh2 mocks (TEST-003)** — needs a
  fixture-driven `ssh2.Client` mock + recorded prompt-replay; a properly-
  scoped multi-hour task on its own.
- **OpenTelemetry SDK wiring (REFACTOR-010)** — `subscribeToLogs()` scaffold
  is in place; backend choice is a product decision.
- **WebGL force-graph topology** — current SVG layout is good enough
  for ≤ 30 hosts; WebGL only matters at scale (REFACTOR-011).

## Phase 6.1 — Windows launch fixes ✅

Landed 2026-05-11 (Cowork-mode session, verified on Windows 11 + Node 25.4.0):

The Windows installer produced in Phase 6 was packaging-correct but
unrunnable. Three root causes, each fixed independently:

- [x] **WIN-001 — asar integrity fuse vs. unsigned Windows builds.**
  `EnableEmbeddedAsarIntegrityValidation: true` in `build/after-pack.cjs`
  required an `ELECTRON_ASAR_INTEGRITY` blob in the PE resource section
  that electron-builder only writes during a code-signing pass. With no
  Windows signing cert configured, the blob is absent; Electron 30+ reads
  the fuse, demands the blob, doesn't find one, and silently exits before
  V8 starts — hence the "blank window that never appears in Task Manager"
  symptom. Fixed by gating the fuse to `electronPlatformName === 'darwin'`.
  Re-enable for Windows once a code-signing cert is wired through
  electron-builder and the signed `.exe` is verified to contain the blob
  (`strings -a VizCloud.exe | grep ELECTRON_ASAR_INTEGRITY`).
- [x] **BLD-002 — `npmRebuild: false` in `build` config.** CLAUDE.md
  already documents the workflow as "npm ci then `@electron/rebuild`";
  the duplicate rebuild attempt electron-builder makes by default chokes
  on optional native deps (e.g. `cpu-features`) on Windows dev boxes
  without Visual Studio Build Tools. `cpu-features` is wrapped in a
  `try/catch` inside `ssh2/lib/protocol/constants.js`; absence falls
  back to JS implementations of AES, with no functional loss.
- [x] **WIN-003 — `HashRouter` instead of `BrowserRouter`.** Under
  `file://` origin, `window.location.pathname` is the absolute path to
  the asar-packed `index.html`, not `/`, so no `<Route path="/...">`
  matches on initial load and every `useNavigate("/hosts")` pushes a
  URL Electron's `will-navigate` handler then blocks. `HashRouter`
  routes off `location.hash`, which is origin-agnostic and works under
  both `file://` (production) and `http://localhost:3000` (dev).

Verification artefacts:
- `%APPDATA%\vizcloud\startup.log` shows the early-crash logger now
  successfully reaches `[info] boot start; platform=win32 arch=x64
  electron=32.3.3` on launch.
- A CDP-driven probe walks all 9 sidebar routes (`#/`, `#/hosts`,
  `#/vms`, `#/clusters`, `#/migration`, `#/topology`, `#/diagnostics`,
  `#/storage`, `#/settings`) and confirms each page heading renders.
- `npm run typecheck` + `npm run lint` clean (0 errors, 9 pre-existing
  warnings in files this change did not touch).
- 51/61 unit tests pass. The 10 failures are `database.service.test.ts`
  hitting an ABI mismatch: `better-sqlite3` was built against Electron
  32's bundled Node (ABI 128) so the packaged app works, but `npm run
  test` runs in standalone Node 25.4 (ABI 141). Resolving needs either
  Node 20 LTS as the local Node, or VS Build Tools to compile a
  separate test-time binary — independent of this Windows-launch work.

## Phase 7 — Innovation backlog (deferred)

These are intentional non-goals for the alpha:

- Kysely / Drizzle migration (REFACTOR-002) — current `rowToX` mappers + named-binding UPSERTs are the bridge.
- Push-based host telemetry agent (REFACTOR-004).
- electron-vite migration (REFACTOR-005) — current vite-plugin-electron config now produces correct CJS for main + preload.
- Feature folders (REFACTOR-006).
- Storybook + Chromatic (REFACTOR-007).
- WebGL force-graph topology (REFACTOR-011).
- Diagnostics rule engine (REFACTOR-012).
- Playbook engine — `workflow_engine.py` reference (REFACTOR-013) — separate project.

---

## Verification commands

```bash
cd ~/Desktop/Dev/VizCloud
rm -rf node_modules
npm ci --ignore-scripts                            # see "macOS install gotcha" below
# build better-sqlite3 from source in a no-spaces path then drop the .node back:
mkdir -p /tmp/vc-build && cp -R node_modules/better-sqlite3 /tmp/vc-build/ \
  && cd /tmp/vc-build/better-sqlite3 && npm install --no-save --build-from-source \
  && cd - && cp /tmp/vc-build/better-sqlite3/build/Release/better_sqlite3.node \
  node_modules/better-sqlite3/build/Release/
npx @electron/rebuild -f -w better-sqlite3,ssh2     # native module rebuild for Electron 32 (after install)
npm run typecheck                                   # all 3 tsconfigs (currently green)
npm run lint                                        # currently 0 errors / 1 warning
npm run test                                        # 61/61 pass
npm run test:coverage                               # currently fails the 60% gate (10.5% lines) — expected
npm run dev                                         # boots VizCloud; sidebar persists across launches
npm run build                                       # vite + vite-plugin-electron emits dist/main/{main.js,preload/preload.js} + dist/renderer/
npm run test:e2e                                    # actual Electron e2e (not yet rerun this pass)
npm run package                                     # produces dist/ + release/<platform>
```

### macOS install gotcha (path-with-parens)

The canonical project path is `/Users/cnelson/Library/CloudStorage/Dropbox/Mac (2)/Desktop/Dev/VizCloud`.
node-gyp's generated Makefile embeds that path with unescaped `(2)`, which
breaks `make` during `better-sqlite3`'s native build. `--ignore-scripts`
during `npm ci` skips it, then we build the native module in `/tmp` (no
spaces) and copy `better_sqlite3.node` back. `electron-rebuild` for the
*Electron* ABI similarly needs to be done from a no-spaces working tree —
or the project moved to a path without parens.

## Agent transition log

| Date       | From → To                          | Outcome |
|------------|------------------------------------|---------|
| 2026-05-09 | Cowork-mode → Claude Code CLI      | Phase 0–4 (excl. signing creds + OTel) shipped. Lockfile generated. Local install/typecheck/test verification deferred to next agent due to sandbox 45s/command hard limit. See `HANDOFF.md`. |
| 2026-05-09 | Claude Code CLI verification pass  | Independent review (see review report) flagged P0/P1 bugs. Fixed: build-path mismatch (consolidated on `vite build` for prod; tsc reserved for typecheck), `as any` casts in `StatusRow`/`HostSummary`, hardcoded `root@` in migration URI, `saveConnection` empty-id SELECT, `gatherHostFacts` & metrics shell `&&`-chain failure cascade, cluster identity collision in `discoverCluster`, `as unknown as VM` in `requireVm`, `discoverOne` empty-uuid match, `started_at` overwrite on re-discovery. Also fixed several pre-existing strict-mode typecheck failures and 4 lint errors that were never end-to-end verified before. **Verified locally: `typecheck ✅` (3/3 configs), `lint ✅` (0 errors), `test ✅` (61/61), `build ✅` (vite emits `dist/main/main.js` + `dist/main/preload/preload.js` + `dist/renderer/`). Coverage gate ❌ — actual lines 10.5% vs 60% threshold — expected; service-layer + page tests are the next ratchet (TEST-003, still partial).** |

## Known limitations (alpha)

- **No code signing yet** — populate the GitHub repository secrets listed in `ci.yml` and re-run package job.
- **Cluster discovery requires `pcs` ≥ 0.10** — `pcs status xml` is the structured-output flag.
- **Metrics rely on `/proc/*`** — Linux hosts only for now.
- **VM disk metadata is best-effort** — `virsh dumpxml --inactive` parsing for full disk attributes is a future improvement.
- **Network topology** is a 2D SVG view; WebGL force-graph upgrade is on the Phase 5 backlog.

---

**Living document.** Update entries here as work lands. The
`vizcloud-review-backlog` artifact in Cowork is the canonical issue
tracker; this file is a human-readable summary.
