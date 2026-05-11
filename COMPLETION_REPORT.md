# VizCloud — Honest Completion Report

**Status:** Pre-alpha (foundation rebuilt, alpha-quality vertical complete)
**Date:** 2026-05-09
**Version:** 1.0.0-alpha.1

> Replaces the earlier "✅ 100% COMPLETE — Production Ready" document.
> That language was inaccurate per Rule 11 (no false claims of
> completion); a comprehensive review found the database schema couldn't
> compile, the renderer had no IPC bridge, and every page was a stub.
>
> This report describes what is **actually** in the codebase as of the
> 2026-05-09 remediation pass.

## What this report is *not*

It is **not** a claim that the project is feature-complete or
production-ready. The phrase "production-ready" should not appear in
project communications until:

- code signing is configured for at least one platform,
- 90% unit-test coverage is achieved (currently the gate is set to 60%
  while the test suite expands), and
- the app has been exercised against a real cluster of HVM hosts in a
  staging environment.

## What landed in this remediation pass

### Architecture
- Typed IPC contract shared by main, preload, renderer.
- Custom `ipcBaseQuery` replaces `fetchBaseQuery({ baseUrl: '/api' })` —
  every RTK Query call now flows through `window.vizcloud.invoke`.
- Push events from main (`host-status`, `vm-state-changed`,
  `migration-progress`, `metrics-tick`) patch RTK Query caches via the
  renderer-side event bridge.
- Single-instance lock + cross-platform sandbox + strict CSP +
  permission-request denial.

### Data layer
- SQLite schema rewritten (separate `CREATE INDEX` statements;
  forward-reference safe ordering; `ON DELETE` posture explicit).
- Migration runner with `pragma user_version` and per-version
  transactions.
- Snake↔camel row mappers (one source of truth).

### Service layer
- `ssh2.Client`-based connection pool with TOFU `known_hosts`.
- Argv-style `runCommand` + remote-shell `shellQuote` (no local-shell
  injection).
- Streaming migrations with live progress events.
- Real `/proc/*` metrics with two-sample deltas.
- Structured `pcs status xml` parsing for clusters.
- `safeStorage`-encrypted password credentials (BLOB column).

### Renderer
- All nine pages now wire to real RTK Query hooks.
- Add Host modal, VM lifecycle controls, live migration UI, settings
  editor, topology visualization, diagnostics panel.
- UI preferences persist via `localStorage` middleware.

### Tooling
- ESLint flat config + Prettier alignment + EditorConfig.
- Tailwind + PostCSS configured (Tailwind classes finally compile).
- Vitest coverage thresholds + Playwright in real-Electron mode.
- GitHub Actions: typecheck/lint/unit + e2e (3 OS) + signed packaging.
- electron-window-state persists window bounds.
- electron-builder afterPack hook flips the recommended Electron Fuses.
- macOS hardened-runtime entitlements file.

## What remains (tracked in `CURRENT_TASKS.md` and the `vizcloud-review-backlog` artifact)

- Code signing credentials (Apple Developer ID, Windows EV cert).
- electron-updater wiring (channel selection + signature verification).
- OpenTelemetry observability SDK integration.
- 90%+ unit-test coverage (currently 60%; ratchet up via PR).
- Full schema migration to Kysely or Drizzle (current mappers are
  the bridge).
- WebGL topology graph; YAML-defined diagnostics rule engine; signed
  playbook runner. (Phase 5 innovation backlog.)

## Reproduction

```bash
npm install
npm run typecheck && npm run lint && npm run test:coverage
npm run dev
```

The app should open with a populated sidebar, a working Dashboard at
`/`, and a functional Add Host modal under `/hosts`. With at least one
host connected, every other page exercises real data flows.
