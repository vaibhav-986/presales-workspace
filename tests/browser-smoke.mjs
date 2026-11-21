import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173';
const adminEmail = process.env.ADMIN_EMAIL || 'admin@presales.local';
const adminPassword = process.env.ADMIN_PASSWORD || 'Presales@2026';
const outputDir = process.env.SMOKE_OUTPUT_DIR || path.join(os.tmpdir(), 'presales-workspace-smoke');
const smokeProperty = `Browser Smoke Hotel ${Date.now()}`;
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
    errors.push(`console: ${message.text()}`);
  }
});
page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
page.on('response', (response) => {
  if (response.status() < 400) return;
  const pathname = new URL(response.url()).pathname;
  if (response.status() === 401 && pathname === '/api/auth/session') return;
  if (response.status() === 404 && pathname === '/favicon.ico') return;
  errors.push(`response: ${response.status()} ${response.url()}`);
});

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
  await page.screenshot({ path: path.join(outputDir, '01-login.png'), fullPage: true });

  await page.getByLabel('Email address').fill(adminEmail);
  await page.getByLabel('Password', { exact: true }).fill(adminPassword);
  await page.getByRole('button', { name: /Sign in securely/ }).click();
  await page.getByRole('heading', { name: 'Presales overview.' }).waitFor();
  await page.screenshot({ path: path.join(outputDir, '02-dashboard.png'), fullPage: true });

  await page.getByRole('button', { name: /Add opportunity/ }).click();
  await page.getByLabel(/Property name/).fill(smokeProperty);
  await page.getByLabel(/Property location/).fill('Bengaluru, India');
  await page.getByRole('button', { name: 'Save opportunity' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.getByText(smokeProperty, { exact: true }).waitFor();

  await page.getByRole('link', { name: 'Opportunities' }).click();
  await page.getByRole('heading', { name: 'Opportunities.' }).waitFor();
  await page.getByLabel('Search opportunities').fill(smokeProperty);
  const row = page.getByRole('row').filter({ hasText: smokeProperty });
  await row.waitFor();
  await page.screenshot({ path: path.join(outputDir, '03-opportunities.png'), fullPage: true });

  page.once('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: `Delete ${smokeProperty}` }).click();
  await row.waitFor({ state: 'detached' });

  await page.getByRole('link', { name: 'Import / Export' }).click();
  await page.getByRole('heading', { name: 'Import & export.' }).waitFor();
  await page.getByRole('link', { name: 'User Profiles' }).click();
  await page.getByRole('heading', { name: 'User profiles.' }).waitFor();

  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Browser smoke test passed. Screenshots: ${outputDir}`);
} finally {
  await browser.close();
}
