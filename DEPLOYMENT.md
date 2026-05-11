# Deployment

**Status:** Pre-alpha. Signing credentials still need to be populated before
distributables are user-installable on macOS / Windows. See `HANDOFF.md` for
what the next agent needs to do.

## Build

```bash
npm run build         # tsc -p tsconfig.main.json + tsconfig.preload.json + vite build
```

Produces:

```
dist/
├── main/
│   ├── main.js               Electron main process (CJS)
│   └── preload/
│       └── preload.js        contextBridge surface (CJS)
└── renderer/
    ├── index.html            Renderer entry
    └── assets/
        ├── main-*.css        Tailwind-compiled stylesheet
        └── *.js              React + RTK Query bundles (lazy code-split per page)
```

## Package

```bash
npm run package           # all platforms supported by the host
npm run package:mac       # macOS .dmg + .zip
npm run package:win       # Windows NSIS .exe + portable .exe
npm run package:linux     # Linux AppImage + .deb
```

`electron-builder` consumes:

- `package.json` `build` block — appId, target list, asar, signing settings.
- `build/entitlements.mac.plist` — macOS hardened-runtime entitlements
  (denies JIT / debugger / library-validation override; grants outbound
  network + user-selected file access).
- `build/after-pack.cjs` — flips Electron Fuses on the packaged binary
  (RunAsNode off, NodeOptionsEnv off, NodeCliInspect off,
  EmbeddedAsarIntegrity on, OnlyLoadAppFromAsar on,
  GrantFileProtocolExtraPrivileges off, EnableCookieEncryption on).

## Code signing — what's missing

`package.json` declares `mac.hardenedRuntime: true` and references the
entitlements file, but it does **not** yet specify a Developer-ID identity or
notarization team. Until you populate the following GitHub repository
secrets, packaged builds will fail Gatekeeper / SmartScreen:

| Secret | Used for |
|---|---|
| `MAC_CERT` | Base64 of the `.p12` Developer ID Application cert |
| `MAC_CERT_PASSWORD` | Password for the `.p12` |
| `APPLE_ID` | Apple ID with App Store Connect access |
| `APPLE_APP_PASSWORD` | App-specific password for `notarytool` |
| `APPLE_TEAM_ID` | Apple Developer Team ID (the 10-char identifier) |
| `WIN_CERT` | (when ready) Base64 of Windows EV signing cert |

The `.github/workflows/ci.yml` `package` job consumes these via `env:` and
will run unsigned (with a warning) when they are absent.

## Auto-update

`electron-updater` is in `dependencies` but **not yet wired**. Channel
selection (GitHub Releases vs. private S3) is an owner decision; once
chosen, instantiate `autoUpdater.setFeedURL(...)` in `src/main/main.ts`
inside `applySessionHardening()` (or a sibling helper) and call
`autoUpdater.checkForUpdatesAndNotify()` after first window load.

## Rollback

Persist data lives at `<userData>/vizcloud.db` (SQLite, WAL). The schema
versioning runner in `src/main/db/database.service.ts` is forward-only;
to roll back, restore a `.db` file from before the upgrade (the migration
runner refuses to apply migrations whose version is below `user_version`,
which means a downgraded binary will still work as long as no migration
has dropped a column relied on by the older code).

## Reference

- `HANDOFF.md` — full agent-to-agent context.
- `REVIEW.md` — original audit (file:line citations).
- `CURRENT_TASKS.md` — phase-by-phase status.
- `COMPLETION_REPORT.md` — honest narrative of what's actually shipped.
- `DEVELOPMENT.md` — 13 immutable project rules.
