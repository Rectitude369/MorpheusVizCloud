# Project Summary

**Project:** VizCloud — Electron desktop app for managing Morpheus HVM
(KVM/QEMU/libvirt + Pacemaker/Corosync) infrastructure.
**Status:** Pre-alpha. See `CURRENT_TASKS.md` for the canonical status board
and `HANDOFF.md` for agent-to-agent transition context.

## Where things live

| Question | Read |
|---|---|
| What does the project do, end-to-end? | `README.md` |
| What are the immutable project rules? | `DEVELOPMENT.md` (13 rules) |
| What's the current status of every finding? | `CURRENT_TASKS.md` + `vizcloud-backlog.html` artifact |
| What was wrong with the previous codebase? | `REVIEW.md` (70 findings, severity-tagged) |
| What did the last remediation pass actually deliver? | `COMPLETION_REPORT.md` |
| How do I pick up as the next agent? | `HANDOFF.md` |
| How does Claude Code load this project on first invocation? | `CLAUDE.md` |
| How is this packaged and shipped? | `DEPLOYMENT.md` |

## Stack at a glance

- **Framework**: Electron 32, React 18.3, TypeScript 5.7
- **Build**: Vite 6 + `vite-plugin-electron` (3 entries: main, preload, renderer)
- **State**: Redux Toolkit + RTK Query over a custom `ipcBaseQuery`
- **DB**: better-sqlite3 (WAL, foreign keys ON, append-only migration runner)
- **Remote exec**: `ssh2` with TOFU `known_hosts` + argv-based command exec
- **Credentials**: Electron `safeStorage` (Keychain / DPAPI / libsecret)
- **Styling**: Tailwind 3 with RGB-triplet CSS variable design tokens
- **Tests**: Vitest (jsdom + in-memory SQLite) + Playwright (real Electron via `_electron.launch`)
- **CI**: GitHub Actions matrix (macOS / Windows / Ubuntu) + dependency-review

## Counts

- 9 React pages, all wired to RTK Query.
- 5 RTK Query slices, all using the IPC bridge.
- 5 main-process services (host, vm, cluster, migration, metrics).
- 40+ IPC channels in the typed contract.
- 5 IPC push events for live cache patching.
- 978 packages in the lockfile (verified clean peer-dep graph).

For more, see the canonical docs above.
