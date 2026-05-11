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

  console.log(`[afterPack] Hardening fuses on ${electronBinaryPath}`);

  await flipFuses(electronBinaryPath, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: electronPlatformName === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
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
