export const DEMO_RATE = { value: '1.10', date: '2026-09-12', demo: true } as const;
export const MICRO = 1_000_000n;
export const NATIVE_PER_MICRO = 1_000_000_000_000n;
export const DAILY_CAP = 5n * MICRO;
export const RESERVE_NATIVE = 10n ** 18n;
export const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;

export function parseAmount(value: string): bigint {
  if (!AMOUNT_PATTERN.test(value) || value.trim() !== value) throw new Error('Invalid decimal amount');
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole!) * MICRO + BigInt(fraction.padEnd(6, '0'));
  if (units <= 0n) throw new Error('Amount must be positive');
  return units;
}

export function formatMicro(value: bigint): string {
  const fraction = (value % MICRO).toString().padStart(6, '0').replace(/0+$/, '');
  return `${value / MICRO}${fraction ? `.${fraction}` : ''}`;
}

export function principal(amount: string, currency: 'USD' | 'EUR'): bigint {
  const purchase = parseAmount(amount);
  const converted = currency === 'EUR' ? purchase * 110n / 100n : purchase;
  const tenth = converted / 10n;
  return tenth < 100_000n ? 100_000n : tenth > MICRO ? MICRO : tenth;
}

export function madridDay(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export type Reservation = { principalMicro: bigint; maximumGasNative: bigint; budgetDay: string; uncertain: boolean };

// Outstanding exposure counts even when its budget day has ended.
export function checkBudget(input: {
  principalMicro: bigint; maximumGasNative: bigint; balanceNative: bigint;
  spentTodayMicro: bigint; reservations: Reservation[];
}): void {
  if (input.principalMicro < 100_000n || input.principalMicro > MICRO ||
      input.maximumGasNative < 0n || input.balanceNative < 0n || input.spentTodayMicro < 0n ||
      input.reservations.some(item => item.principalMicro < 0n || item.maximumGasNative < 0n)) {
    throw new Error('Invalid budget input');
  }
  if (input.reservations.some(item => item.uncertain)) throw new Error('Unresolved transaction');
  const pending = input.reservations.reduce((sum, item) => sum + item.principalMicro, 0n);
  if (input.spentTodayMicro + pending + input.principalMicro > DAILY_CAP) throw new Error('Daily cap exceeded');
  const exposure = input.reservations.reduce((sum, item) =>
    sum + item.principalMicro * NATIVE_PER_MICRO + item.maximumGasNative, 0n);
  if (input.balanceNative - exposure - input.principalMicro * NATIVE_PER_MICRO - input.maximumGasNative < RESERVE_NATIVE) {
    throw new Error('Insufficient reserve after maximum gas');
  }
}
