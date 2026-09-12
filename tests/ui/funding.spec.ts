import { expect, test, type Page } from '@playwright/test';

const address = '0xE0025f5afd3FD375e30E8C3679924a499eE926F4';
const wallet = { address, balanceUsdc: '9.993153889999999688', chainId: 5042002, holdings: [] };

async function mockWallet(page: Page, state: { balance: string; fail?: boolean; chainId?: number }, writes: string[]) {
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') writes.push(`${request.method()} ${path}`);
    if (path === '/api/config') return route.fulfill({ json: { privyAppId: 'public-test-app' } });
    if (path === '/api/status') {
      if (state.fail) return route.fulfill({ status: 503, json: { error: 'Arc wallet state unavailable' } });
      return route.fulfill({ json: {
        wallet: { ...wallet, balanceUsdc: state.balance, chainId: state.chainId ?? wallet.chainId },
        execution: { enabled: false, paused: true, reason: 'Classification remains blocked.' },
        limits: { dailyCapUsdc: '5', reserveUsdc: '1' },
        eurUsdRate: { value: '1.10', date: '2026-09-12', demo: true },
      } });
    }
    if (path === '/api/events') return route.fulfill({ json: { events: [] } });
    if (path === '/api/shortcut' && request.method() === 'GET') return route.fulfill({ json: { enabled: false, endpointPath: '/api/notifications/apple-wallet' } });
    throw new Error(`Unexpected request: ${request.method()} ${path}`);
  });
}

test('funding stays private and copies the existing wallet with explicit testnet instructions', async ({ page }) => {
  const writes: string[] = [];
  await mockWallet(page, { balance: wallet.balanceUsdc }, writes);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (value: string) => { sessionStorage.setItem('copied-address', value); } } });
  });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Add test USDC' })).toHaveCount(0);
  await page.goto('/?signed-in=1');
  const funding = page.getByRole('region', { name: 'Add test USDC' });
  await expect(funding.getByLabel('Receive address', { exact: false })).toHaveValue(address);
  await expect(funding.getByText(/do not send real funds or use another network/)).toBeVisible();
  await expect(funding.getByLabel('Receive address', { exact: false })).toHaveAttribute('readonly', '');
  await expect(funding.getByRole('link', { name: 'Open Circle faucet' })).toHaveAttribute('href', 'https://faucet.circle.com/');
  await funding.getByRole('button', { name: 'Copy wallet address' }).click();
  await expect(funding.getByRole('status')).toContainText('Wallet address copied');
  expect(await page.evaluate(() => sessionStorage.getItem('copied-address'))).toBe(address);
  expect(writes).toEqual([]);
});

test('checking funding observes a new balance without claiming a specific deposit or buying', async ({ page }) => {
  const state = { balance: wallet.balanceUsdc };
  const writes: string[] = [];
  await mockWallet(page, state, writes);
  await page.goto('/?signed-in=1');
  const funding = page.getByRole('region', { name: 'Add test USDC' });
  await expect(funding).toBeVisible();
  await funding.getByRole('button', { name: 'Check incoming funds' }).click();
  await expect(funding.getByRole('status')).toContainText('Balance checked');
  state.balance = '19.993153889999999688';
  await funding.getByRole('button', { name: 'Check incoming funds' }).click();
  await expect(funding.locator('dl > div').filter({ hasText: 'Balance when opened' })).toContainText(wallet.balanceUsdc);
  await expect(funding.locator('dl > div').filter({ hasText: 'Latest observed balance' })).toContainText(state.balance);
  await expect(funding.getByRole('status')).toContainText('A balance change alone does not confirm a particular deposit');
  await expect(page.getByText('Purchases are paused', { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(funding.getByRole('button', { name: 'Check incoming funds' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('clipboard denial leaves full address available for manual copying', async ({ page }) => {
  await mockWallet(page, { balance: wallet.balanceUsdc }, []);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Permission denied'); } } });
  });
  await page.goto('/?signed-in=1');
  const funding = page.getByRole('region', { name: 'Add test USDC' });
  await funding.getByRole('button', { name: 'Copy wallet address' }).click();
  await expect(funding.getByRole('alert')).toContainText('Select and copy the full address manually');
  await expect(funding.getByLabel('Receive address', { exact: false })).toHaveValue(address);
  await expect(funding.getByRole('status')).toHaveCount(0);
});

test('failed wallet refresh never reports a successful funding check', async ({ page }) => {
  const state = { balance: wallet.balanceUsdc, fail: false };
  await mockWallet(page, state, []);
  await page.goto('/?signed-in=1');
  const funding = page.getByRole('region', { name: 'Add test USDC' });
  await expect(funding).toBeVisible();
  state.fail = true;
  await funding.getByRole('button', { name: 'Check incoming funds' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /Arc wallet state unavailable|Unable to check incoming funds/ }).first()).toBeVisible();
  await expect(page.getByText('Balance checked.', { exact: false })).toHaveCount(0);
});

test('wrong chain blocks funding instructions and copy actions', async ({ page }) => {
  await mockWallet(page, { balance: wallet.balanceUsdc, chainId: 1 }, []);
  await page.goto('/?signed-in=1');
  const funding = page.getByRole('region', { name: 'Add test USDC' });
  await expect(funding.getByRole('alert')).toContainText('Arc testnet (chain 5042002)');
  await expect(funding.getByRole('button', { name: 'Copy wallet address' })).toHaveCount(0);
  await expect(funding.getByRole('link', { name: 'Open Circle faucet' })).toHaveCount(0);
});
