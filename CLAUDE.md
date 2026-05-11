# CLAUDE.md

This file is loaded by Claude Code on every invocation in this repo. Keep it
short, factual, and updated. Long-form context lives in `HANDOFF.md`,
`REVIEW.md`, and `DEVELOPMENT.md`.

---

## Project

VizCloud — Electron desktop app for managing Morpheus HVM (KVM/QEMU/libvirt
+ Pacemaker) infrastructure. Pre-alpha. React 18 + RTK Query + TypeScript +
better-sqlite3 + ssh2.

Owner: Chris Nelson (cnelson@rectitude369.com), Senior Director DevOps &
Integrations at Rectitude 369. Background: 30+ years IT, virtualization,
firewall (WatchGuard / Palo Alto). Values quality, innovation, no shortcuts.

## Mandatory rules — read first

`DEVELOPMENT.md` — 13 immutable project rules. **Re-read every session.**
Rules of particular note:

- **Rule 1** No changes to foundational features without explicit user OK.
- **Rule 3** No mocks / placeholders / TODO comments in production paths.
- **Rule 6** Clarify before assuming. Ask the user when in doubt.
- **Rule 11** Never claim "complete" / "100%" / "production-ready" unless
  it actually is and the user has agreed.
- **Rule 13** Quality first. Zero TS errors. Zero ESLint errors. 90% coverage
  is the target (currently gated at 60% — ratchet up, never down).

## Critical first-time setup

```bash
cd ~/Desktop/Dev/VizCloud
rm -rf node_modules
npm ci                                          # uses committed package-lock.json
npx @electron/rebuild -f -w better-sqlite3,ssh2 # native modules for Electron 32
npm run typecheck                               # all 3 tsconfigs
npm run lint
npm run test
npm run dev
```

If `npm ci` fails on peer-dep math, check `HANDOFF.md` "Known unknowns" —
the previous agent (Cowork) couldn't run the install end-to-end and may
have left a stale lockfile.

## Architecture in one paragraph

Electron with three TS projects: **main** (CommonJS, services + DB), **preload**
(CommonJS, contextBridge over `window.vizcloud`), **renderer** (React, ESM via
Vite). Renderer talks to main only through the typed IPC contract in
`src/shared/ipc/contract.ts`. RTK Query uses a custom `ipcBaseQuery` over
that bridge — no HTTP server. SQLite (WAL, foreign-keys ON) lives at
`<userData>/vizcloud.db`. Remote host commands flow through
`src/main/lib/ssh-client.ts` — pooled `ssh2.Client` with argv-based
`runCommand`, never `child_process.exec`.

## Key files to know

| File | Why |
|---|---|
| `src/shared/ipc/contract.ts` | Add a new feature → start here |
| `src/main/core/ipc.handlers.ts` | Where every channel is handled |
| `src/main/db/schema.ts` | Schema as a `MIGRATIONS[]` list — append only |
| `src/main/db/mappers.ts` | snake_case → camelCase row conversion |
| `src/main/lib/ssh-client.ts` | Hardened SSH; `shellQuote` for arg safety |
| `src/main/lib/parsers.ts` | Pure parsers for `/proc/*` + virsh + pcs xml |
| `src/main/services/host-repository.ts` | Single source of truth for hosts |
| `src/renderer/store/api/ipcBaseQuery.ts` | RTK Query bridge |
| `src/renderer/lib/event-bridge.ts` | Push-event → cache-patch wiring |
| `src/renderer/preload.d.ts` | `Window` augmentation for `window.vizcloud` |

## Hard "don'ts"

- ❌ Don't use `child_process.exec` with user input. Use `SshClient.runCommand([...argv])`.
- ❌ Don't cast SQLite rows with `as Host[]` etc. Use the `rowTo*` mappers.
- ❌ Don't add inline `INDEX` clauses to `CREATE TABLE` — SQLite rejects them.
- ❌ Don't store passwords in plaintext. Use `safeStorage.encryptString()`.
- ❌ Don't add `any`. ESLint enforces.
- ❌ Don't edit a shipped `MIGRATIONS[]` entry. Add a new version instead.
- ❌ Don't delete `subscribeToLogs()` in `logger.service.ts` — it's an
  intentional scaffold for OpenTelemetry wiring.

## When you're done with a task

1. `npm run typecheck && npm run lint && npm run test` — all green.
2. Update `CURRENT_TASKS.md` with what landed.
3. Update the relevant entry in `vizcloud-backlog.html` (status field).
4. Commit message format: `<id>: <one-line summary>` (e.g.,
   `SEC-008: wire mac.identity + mac.notarize from repo secrets`).
5. **Do not** mark something `done` if any of: tests fail, an `any` slipped
   in, a TODO comment was added, or you couldn't actually validate the path
   end-to-end.

## Phase 5 backlog — only on explicit owner request

`REFACTOR-002`, `REFACTOR-004`, `REFACTOR-005`, `REFACTOR-006`,
`REFACTOR-007`, `REFACTOR-011`, `REFACTOR-012`, `REFACTOR-013` are all
intentionally deferred. Each is project-sized; do not start without
acknowledgment.

## Reference docs

- `HANDOFF.md` — full context for picking up where Cowork left off.
- `REVIEW.md` — original 70-finding audit with file:line citations.
- `CURRENT_TASKS.md` — phase-by-phase status board.
- `COMPLETION_REPORT.md` — honest narrative of what's actually shipped.
- `DEVELOPMENT.md` — the 13 immutable rules.
- `vizcloud-backlog.html` artifact — interactive backlog explorer.
