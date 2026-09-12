import { expect, test } from '@playwright/test';
const wallet = { address: '0xE0025f5afd3FD375e30E8C3679924a499eE926F4', balanceUsdc: '10', chainId: 5042002, holdings: [] };
const reason = 'QVAC/NVIDIA classification gate failed. Purchases remain disabled; explicit retry will be required after resolution.';
const status = { wallet, execution: { enabled: false, paused: true, reason }, limits: { dailyCapUsdc: '5', reserveUsdc: '1' }, eurUsdRate: { value: '1.10', date: '2026-09-12', demo: true } };

test('private login surface shows no wallet state before authentication', async ({ page }) => {
  await page.route('**/api/config', route => route.fulfill({ json: { privyAppId: 'public-test-app' } }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in with Privy' })).toBeVisible();
  await expect(page.getByText('10', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Purchases are disabled.', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/login.png', fullPage: true });
});

test('simulation saves visibly blocked with stable ID after uncertain network response', async ({ page }) => {
  const saved: Record<string, unknown>[] = [];
  let attempts = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/config') return route.fulfill({ json: { privyAppId: 'public-test-app' } });
    if (path === '/api/shortcut') return route.fulfill({ json: { enabled: false, endpointPath: '/api/notifications/apple-wallet' } });
    if (path === '/api/status') return route.fulfill({ json: status });
    if (path === '/api/events' && route.request().method() === 'GET') return route.fulfill({ json: { events: saved } });
    if (path === '/api/events') {
      const body = route.request().postDataJSON(); attempts++;
      if (!saved.length) saved.push({ ...body, status: 'needs_retry', reason, principalUsdc: '0.55', source: 'simulation' });
      expect(body.id).toBe(saved[0]!.id);
      if (attempts === 1) return route.abort('failed');
      if (attempts === 2) return route.fulfill({ status: 429, json: { error: 'Wait one minute' } });
      return route.fulfill({ status: 200, json: { event: saved[0] } });
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  await page.goto('/?signed-in=1');
  await expect(page.getByText('Purchases are paused')).toBeVisible();
  await page.getByLabel('Merchant', { exact: true }).fill('Apple Store Madrid');
  await page.getByLabel('Purchase amount').fill('5.00');
  await page.getByLabel('Currency').selectOption('EUR');
  await expect(page.getByText(/1 EUR = 1.10 USD/)).toBeVisible();
  await page.getByRole('button', { name: 'Save simulation', exact: false }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Merchant', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry saving this simulation' }).click();
  await expect(page.getByRole('alert')).toContainText('Wait one minute');
  await page.reload();
  await page.getByRole('button', { name: 'Retry saving this simulation' }).click();
  await expect(page.getByText('Not purchased', { exact: true })).toBeVisible();
  await expect(page.getByText(/It will not run automatically later/)).toBeVisible();
  expect(saved).toHaveLength(1);
  await page.screenshot({ path: 'test-results/dashboard.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Not purchased', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(element => element.getBoundingClientRect().right > innerWidth + 1).map(element => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right })));
  expect(overflow).toEqual([]);
});

test('chain failure never appears as a zero balance or enables the simulation form', async ({ page }) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/config') return route.fulfill({ json: { privyAppId: 'public-test-app' } });
    if (path === '/api/shortcut') return route.fulfill({ json: { enabled: false, endpointPath: '/api/notifications/apple-wallet' } });
    if (path === '/api/status') return route.fulfill({ status: 503, json: { error: 'Arc wallet state unavailable' } });
    return route.fulfill({ json: { events: [] } });
  });
  await page.goto('/?signed-in=1');
  await expect(page.getByRole('alert')).toContainText('Arc wallet state unavailable');
  await expect(page.getByRole('button', { name: 'Save simulation', exact: false })).toBeDisabled();
  await expect(page.getByText('Balances unavailable until the wallet refresh succeeds.')).toBeVisible();
});
