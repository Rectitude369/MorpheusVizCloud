<div align="center">

# ☁️ MorpheusVizCloud

### 🖥️ Next-Gen Desktop Infrastructure Manager for Morpheus HVM

[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![Version](https://img.shields.io/badge/v1.0.0--alpha.1-ff6b35.svg?style=for-the-badge&logo=semver&logoColor=white)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-32-47848F.svg?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

**Manage KVM/QEMU/libvirt hosts, Pacemaker clusters, and virtual machines — all from a single, beautifully crafted desktop app.**

[Features](#-features) · [Quick Start](#-quick-start) · [Architecture](#-architecture) · [Development](#-development) · [Docs](#-documentation)

---

</div>

## 🌟 Overview

MorpheusVizCloud is a **production-grade Electron desktop application** purpose-built for managing **Morpheus HVM** (KVM/QEMU/libvirt + Pacemaker/Corosync) infrastructure. Includes cluster views & operations with live VM migration, Pacemaker quorum monitoring, and HPE Support log bundle collection.

> 🔒 **Privacy-first** — all operations run over SSH directly from your machine. No cloud intermediary. Your credentials stay in your OS keychain.

---

## ✨ Features

### 🟢 Production-Ready

| Feature | Description |
|---------|-------------|
| 🖥️ **Host Management** | Discover via SSH (key/agent/password+keychain), connect, monitor, remove. CPU/memory/storage stats, libvirt/QEMU versions, VM counts, heartbeat polling |
| 🔄 **Auto-Rehydration** | On launch, previously-connected hosts lazy-reconnect and refresh VM lists. Throttled at 4 concurrent ops |
| ⚡ **VM Lifecycle** | State-aware controls — start, shutdown, reboot, reset, suspend, resume, force-off |
| 🔗 **Cluster Support** | Pacemaker/Corosync discovery via `pcs status xml`; quorum meter, member grid, DC marker. Smart cluster identity resolution |
| 🚀 **Live Migration** | `virsh migrate --verbose` with streamed progress bar, per-VM concurrency locks, and cancel support |
| 📊 **Real-time Metrics** | `/proc/stat`, `/proc/meminfo`, `/proc/diskstats`, `/proc/net/dev` — parsed with two-sample deltas, pushed live via IPC |
| 🗺️ **Topology View** | SVG visualization with cluster-aware grouping (members inside labeled shelves with connecting rings) |
| 🔍 **Diagnostics** | Per-host KPI panel + live log tail (morphd, pacemaker, corosync, pcsd, libvirtd, syslog) |
| 📦 **HPE Support Bundles** | SCP-upload `collect.sh`, auto-answer prompts, download `.tar.gz` via SFTP. Save-As / Reveal / Delete per bundle |
| 🌙 **Dark Theme** | Tailwind-driven with runtime theme switching via CSS variables |

### 🟡 Wired & Ready

| Feature | Status |
|---------|--------|
| 🔄 **Auto-Update** | `electron-updater` integrated — set a feed URL in Settings to activate |
| ✍️ **Code Signing** | Config ready — populate cert secrets to enable macOS notarization & Windows signing |

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Version |
|-------------|--------|
| 📦 **Node.js** | 18.x+ |
| 📦 **npm** | 8.x+ |
| 🗄️ **better-sqlite3** | Auto-installed (native module) |

### Development Setup

```bash
# Clone the repository
git clone https://github.com/Rectitude369/MorpheusVizCloud.git
cd MorpheusVizCloud

# Install dependencies
npm install

# Launch in dev mode (hot-reload)
npm run dev
```

> ⚠️ **macOS path-with-parens gotcha** — If your project lives under a path with parentheses (e.g. Dropbox `Mac (2)`), node-gyp will fail building `better-sqlite3`. See the [workaround below](#-macos-native-module-workaround).

### 📦 Production Builds

```bash
# Build all (renderer + main + preload)
npm run build

# Platform-specific installers → release/
npm run package:mac      # DMG + ZIP (arm64)
npm run package:win      # NSIS installer + portable EXE
npm run package:linux    # AppImage + .deb
```

---

## 🏗️ Architecture

### Tech Stack

```
┌──────────────────────────────────────────────────────────┐
│  🎨 RENDERER (React 18 + TypeScript 5.7)                │
│  ├─ Redux Toolkit + RTK Query (ipcBaseQuery)            │
│  ├─ Tailwind CSS 3 (CSS-var design tokens)              │
│  ├─ 9 pages · 5 RTK Query slices · react-router v6      │
│  └─ react-hot-toast · react-icons · Framer Motion       │
├──────────────────────────────────────────────────────────┤
│  🔌 IPC BRIDGE (40+ typed channels · 5 push events)     │
├──────────────────────────────────────────────────────────┤
│  ⚙️ MAIN PROCESS (Electron 32)                          │
│  ├─ 5 services (host, vm, cluster, migration, metrics)  │
│  ├─ better-sqlite3 (WAL, FK ON, append-only migrations) │
│  ├─ ssh2 (TOFU known_hosts, argv-based command exec)    │
│  ├─ Electron safeStorage (Keychain / DPAPI / libsecret) │
│  └─ electron-updater · electron-log                     │
├──────────────────────────────────────────────────────────┤
│  🔨 BUILD (Vite 6 + vite-plugin-electron)               │
│  🧪 TEST (Vitest + Playwright)                          │
│  🚢 CI (GitHub Actions: macOS / Windows / Ubuntu)       │
└──────────────────────────────────────────────────────────┘
```

### 📁 Project Structure

```
MorpheusVizCloud/
├── 📂 src/
│   ├── 📂 main/                 # Electron main process
│   │   ├── 📂 core/             # Logger, IPC, Window management
│   │   ├── 📂 db/               # SQLite database & schema
│   │   ├── 📂 lib/              # Shared libraries
│   │   └── 📂 services/         # Business logic (5 services)
│   ├── 📂 renderer/             # React frontend
│   │   ├── 📂 components/       # UI components (atoms → organisms)
│   │   ├── 📂 pages/            # 9 application pages
│   │   ├── 📂 store/            # Redux + RTK Query slices
│   │   └── 📂 styles/           # Global styles & animations
│   ├── 📂 preload/              # Electron preload scripts
│   └── 📂 shared/               # Shared types & constants
├── 📂 tests/
│   ├── 📂 unit/                 # Vitest unit tests
│   └── 📂 e2e/                  # Playwright E2E tests
├── 📂 build/                    # electron-builder resources
├── 📂 docs/                     # Documentation
└── 📂 assets/                   # Fonts, icons, images
```

---

## 🛠️ Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | 🔥 Start dev server with hot-reload |
| `npm run dev:main` | ⚙️ Main process only |
| `npm run dev:renderer` | 🎨 Renderer only |
| `npm run build` | 📦 Production build |
| `npm run typecheck` | ✅ TypeScript validation (all configs) |
| `npm run lint` | 🔍 ESLint check |
| `npm run lint:fix` | 🔧 Auto-fix lint issues |
| `npm run format` | 💅 Prettier formatting |
| `npm run test` | 🧪 Unit tests (Vitest) |
| `npm run test:e2e` | 🎭 E2E tests (Playwright) |
| `npm run test:coverage` | 📊 Coverage report |
| `npm run package` | 📦 Create distributable |
| `npm run rebuild` | 🔨 Rebuild native modules |

### 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests (requires built app)
npm run test:e2e

# Coverage report
npm run test:coverage
```

---

## 📋 Advanced Setup

### 🍎 macOS Native Module Workaround

If your project path contains parentheses (e.g. Dropbox `Mac (2)`), node-gyp fails building `better-sqlite3`:

```bash
# Skip postinstall, build in /tmp instead:
npm ci --ignore-scripts
mkdir -p /tmp/vc-build
cp -R node_modules/better-sqlite3 /tmp/vc-build/
cd /tmp/vc-build/better-sqlite3
npm install --no-save --build-from-source
cp build/Release/better_sqlite3.node \
   "$OLDPWD/node_modules/better-sqlite3/build/Release/"
```

For Electron-ABI prebuilds:

```bash
cd node_modules/better-sqlite3
npx prebuild-install --runtime electron --target 32.3.3 --arch arm64
```

### 🪟 Cross-Building Windows from macOS

```bash
brew install wine
mkdir -p ~/Library/Caches/electron-builder/wine/wine-4.0.1-mac/bin
ln -sf "$(which wine)" \
   ~/Library/Caches/electron-builder/wine/wine-4.0.1-mac/bin/wine64

curl -fsSL -o \
  ~/Library/Caches/electron-builder/winCodeSign/winCodeSign-2.6.0/rcedit-x64.exe \
  https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe
```

Then `npm run package:win -- --x64` produces NSIS installer (~115 MB) + portable EXE (~99 MB).

### ✍️ Code Signing

Builds are currently unsigned. To enable:

| Platform | Secrets Required | Purpose |
|----------|------------------|---------|
| 🍎 macOS | `MAC_CERT` + `MAC_CERT_PASSWORD` | Developer ID cert (.p12) |
| 🍎 macOS | `APPLE_ID` + `APPLE_APP_PASSWORD` + `APPLE_TEAM_ID` | Notarization |
| 🪟 Windows | `WIN_CERT` + `WIN_CERT_PASSWORD` | Code-signing cert (.pfx) |

### 🔄 Auto-Update

`electron-updater` is wired but off by default. To activate:

1. Pick a release channel (GitHub Releases, S3, static hosting)
2. In VizCloud → Settings → set `updates.feedUrl`
3. Restart — the app checks for updates on launch and prompts `Download / Later`

---

## 📊 Project Stats

| Metric | Count |
|--------|-------|
| 📄 React Pages | 9 |
| 🔌 RTK Query Slices | 5 |
| ⚙️ Main-Process Services | 5 |
| 📡 IPC Channels | 40+ |
| 📢 IPC Push Events | 5 |
| 📦 Dependencies | 978 (clean peer-dep graph) |

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| 📖 [README.md](README.md) | This file |
| 📋 [CURRENT_TASKS.md](CURRENT_TASKS.md) | Live task dashboard |
| 📜 [DEVELOPMENT.md](DEVELOPMENT.md) | 13 immutable development rules |
| 🚀 [DEPLOYMENT.md](DEPLOYMENT.md) | Packaging & deployment guide |
| 🏗️ [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) | Quick project overview |
| 🔄 [HANDOFF.md](HANDOFF.md) | Agent-to-agent transition context |
| 🔍 [REVIEW.md](REVIEW.md) | Codebase audit (70 findings) |
| ✅ [COMPLETION_REPORT.md](COMPLETION_REPORT.md) | Remediation pass results |

---

## 📄 License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with ❤️ by the Rectitude369 team**

⭐ Star this repo if you find it useful!

</div>
