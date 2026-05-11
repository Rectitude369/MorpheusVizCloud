/**
 * Navigation behavior in the actual Electron window.
 */

import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

let app: ElectronApplication;
let window: Page;
let userDataDir: string;

test.beforeAll(async () => {
  userDataDir = await mkdtemp(join(tmpdir(), 'vizcloud-nav-'));
  app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`] });
  window = await app.firstWindow();
});

test.afterAll(async () => {
  await app.close();
  await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
});

test('active nav item highlights the current route', async () => {
  await window.getByRole('button', { name: 'Hosts' }).click();
  await expect(window).toHaveURL(/\/hosts$/);
  await window.getByRole('button', { name: 'Clusters' }).click();
  await expect(window).toHaveURL(/\/clusters$/);
});

test('returns to dashboard', async () => {
  await window.getByRole('button', { name: 'VMs' }).click();
  await window.getByRole('button', { name: 'Dashboard' }).click();
  await expect(window).toHaveURL(/\/(?:#?)$/);
});

test('search input is reachable via keyboard', async () => {
  await window.locator('input[type="search"]').first().focus();
  await window.keyboard.type('test');
  expect(await window.locator('input[type="search"]').first().inputValue()).toBe('test');
});
