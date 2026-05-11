/**
 * electron-builder afterPack hook.
 *
 * Flips the recommended hardened set of Electron Fuses on the packaged
 * binary (SEC-007). Fuses are baked into the executable at sign time and
 * cannot be flipped at runtime, providing defense-in-depth even if an
 * attacker can write to the app bundle.
 *
 * Reference: https://www.electronjs.org/docs/latest/tutorial/fuses
 */

'use strict';

const path = require('path');

module.exports = async function afterPack(context) {
  // Lazy-require so the package install doesn't break in CI environments
  // that haven't yet hydrated devDependencies (e.g. when only running
  // npm run build without packaging).
  let flipFuses;
  let FuseVersion;
  let FuseV1Options;
  try {
    ({ flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses'));
  } catch (err) {
    console.warn('[afterPack] @electron/fuses not installed; skipping fuse flip:', err.message);
    return;
  }

  const { electronPlatformName, appOutDir, packager } = context;
  const ext = {
    darwin: '.app',
    win32: '.exe',
    linux: '',
  }[electronPlatformName];
  const productFilename =
    electronPlatformName === 'darwin'
      ? `${packager.appInfo.productFilename}.app`
      : electronPlatformName === 'win32'
        ? `${packager.appInfo.productFilename}.exe`
        : packager.appInfo.productFilename;
  const electronBinaryPath = path.join(appOutDir, productFilename + (ext === '.app' ? '' : ''));

  // EnableEmbeddedAsarIntegrityValidation requires an integrity-hash blob
  // (`ELECTRON_ASAR_INTEGRITY`) to be embedded in the binary at pack time.
  //
  //   - macOS: electron-builder computes and writes the blob unconditionally
  //     (it's part of the .app bundle's Info.plist + binary resources), and
  //     the ad-hoc signature `resetAdHocDarwinSignature: true` below repairs
  //     the codesign after we flip the fuse bits.
  //
  //   - Windows: the blob is written into the PE resource section by
  //     electron-builder's signing pipeline. If the build has no code-signing
  //     certificate configured (`build.win.certificateFile`, env CSC_LINK,
  //     etc.), the signing step is skipped and **the integrity blob is never
  //     embedded**. At runtime, Electron sees the fuse ON, looks for the
  //     blob, doesn't find one, and silently exits before any JS executes —
  //     producing the "blank window that never appears in Task Manager"
  //     symptom Windows users hit on this project (May 2026).
  //
  //   - Linux: same story; no integrity blob written by builder.
  //
  // So we only enable this fuse where we know the build pipeline can
  // honor it. Re-enable for Windows once a code-signing cert is wired up
  // through electron-builder and the signed binary is verified to contain
  // the ELECTRON_ASAR_INTEGRITY blob (search the .exe with `strings -a`).
  const canEmbedAsarIntegrity = electronPlatformName === 'darwin';

  console.log(
    `[afterPack] Hardening fuses on ${electronBinaryPath} ` +
      `(asar-integrity=${canEmbedAsarIntegrity ? 'on' : 'off (no signing on this platform)'})`,
  );

  await flipFuses(electronBinaryPath, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: electronPlatformName === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: canEmbedAsarIntegrity,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    // Must be `true` because the renderer is loaded via `mainWindow.loadFile()`
    // — i.e. a `file://` URL from inside the asar. Disabling this fuse breaks
    // the renderer with ERR_FILE_NOT_FOUND. The "disable for security" advice
    // in the Electron docs applies only to apps that serve their renderer
    // through `protocol.handle()` or remote HTTPS; we don't.
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: true,
  });
};
