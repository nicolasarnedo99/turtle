import { expect, test } from '@playwright/test';

const first = 'turtle_shortcut_' + 'A'.repeat(43);
const second = 'turtle_shortcut_' + 'B'.repeat(43);
const wallet = { address: '0xE0025f5afd3FD375e30E8C3679924a499eE926F4', balanceUsdc: '9.993153889999999688', chainId: 5042002, holdings: [] };
const status = { wallet, execution: { enabled: false, paused: true, reason: 'Classification failed' }, limits: { dailyCapUsdc: '5', reserveUsdc: '1' }, eurUsdRate: { value: '1.10', date: '2026-09-12', demo: true } };

test('Shortcut setup shows a scoped token once, supports replacement and revocation', async ({ page }) => {
  let enabled = false;
  let generations = 0;
  const writes: string[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') writes.push(path);
    if (path === '/api/config') return route.fulfill({ json: { privyAppId: 'public-test-app' } });
    if (path === '/api/status') return route.fulfill({ json: status });
    if (path === '/api/events') return route.fulfill({ json: { events: [] } });
    if (path === '/api/shortcut') return route.fulfill({ json: { enabled, endpointPath: '/api/notifications/apple-wallet' } });
    if (path === '/api/shortcut/token') { enabled = true; generations++; return route.fulfill({ json: { token: generations === 1 ? first : second, endpointPath: '/api/notifications/apple-wallet' } }); }
    if (path === '/api/shortcut/revoke') { enabled = false; return route.fulfill({ json: { enabled: false } }); }
    throw new Error(`Unexpected request: ${path}`);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Create Shortcut token' })).toHaveCount(0);
  await page.goto('/?signed-in=1');
  const setup = page.getByRole('region', { name: 'Connect a card-tap Shortcut' });
  await setup.getByRole('button', { name: 'Create Shortcut token' }).click();
  await expect(setup.getByLabel('Authorization header', { exact: false })).toHaveValue(`Bearer ${first}`);
  await expect(setup.getByLabel('Authorization header', { exact: false })).toHaveAttribute('type', 'password');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(first);
  await page.reload();
  await expect(setup.getByText('Shortcut access is enabled.', { exact: true })).toBeVisible();
  await expect(setup.getByLabel('Authorization header', { exact: false })).toHaveCount(0);
  await setup.getByRole('button', { name: 'Replace Shortcut token' }).click();
  await expect(setup.getByLabel('Authorization header', { exact: false })).toHaveValue(`Bearer ${second}`);
  await setup.getByRole('button', { name: 'Show header', exact: true }).click();
  await expect(setup.getByLabel('Authorization header', { exact: false })).toHaveAttribute('type', 'text');
  await setup.getByRole('button', { name: 'Revoke Shortcut access' }).click();
  await expect(setup.getByText('Shortcut access is not enabled.', { exact: true })).toBeVisible();
  await expect(setup.getByLabel('Authorization header', { exact: false })).toHaveCount(0);
  expect(writes).toEqual(['/api/shortcut/token', '/api/shortcut/token', '/api/shortcut/revoke']);
});

test('received card-tap activity is distinct from simulation and stays unpurchased', async ({ page }) => {
  const events: Record<string, unknown>[] = [];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') throw new Error('Viewing notifications must not send transactions');
    if (path === '/api/config') return route.fulfill({ json: { privyAppId: 'public-test-app' } });
    if (path === '/api/status') return route.fulfill({ json: status });
    if (path === '/api/shortcut') return route.fulfill({ json: { enabled: true, endpointPath: '/api/notifications/apple-wallet' } });
    return route.fulfill({ json: { events } });
  });
  await page.goto('/?signed-in=1');
  await expect(page.getByText('No events yet')).toBeVisible();
  events.push({ id: 'ec054ae0-7d92-4e4d-89ac-f32ef68afc64', merchant: 'Card tap at local café', amount: '4.50', currency: 'EUR', timestamp: '2026-09-12T09:00:00Z', source: 'apple_wallet', status: 'needs_retry', reason: 'Purchases remain disabled', principalUsdc: '0.495' });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('.events li')).toHaveCount(1);
  await expect(page.locator('.events li')).toContainText('Apple Wallet Shortcut');
  await expect(page.locator('.events li')).toContainText('Not purchased');
  await page.getByText('Set up the Shortcut on your iPhone', { exact: true }).click();
  await expect(page.getByLabel('Notification endpoint')).toHaveValue('http://127.0.0.1:4175/api/notifications/apple-wallet');
  await expect(page.getByText(/Receipt is not proof of card settlement/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/shortcut-mobile.png', fullPage: true });
});

test('uncertain token creation requires checking state instead of claiming setup succeeded', async ({ page }) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/config') return route.fulfill({ json: { privyAppId: 'public-test-app' } });
    if (path === '/api/status') return route.fulfill({ json: status });
    if (path === '/api/events') return route.fulfill({ json: { events: [] } });
    if (path === '/api/shortcut') return route.fulfill({ json: { enabled: false, endpointPath: '/api/notifications/apple-wallet' } });
    return route.abort('failed');
  });
  await page.goto('/?signed-in=1');
  const setup = page.getByRole('region', { name: 'Connect a card-tap Shortcut' });
  await setup.getByRole('button', { name: 'Create Shortcut token' }).click();
  await expect(setup.getByRole('alert')).toContainText('Setup change could not be confirmed');
  await expect(setup.getByLabel('Authorization header', { exact: false })).toHaveCount(0);
  await expect(setup.getByRole('button', { name: 'Create Shortcut token' })).toBeDisabled();
});
