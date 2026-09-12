import { describe, expect, it } from 'vitest';
import { checkBudget, formatMicro, madridDay, parseAmount, principal } from '../../server/money.js';

describe('purchase principal', () => {
  it('rounds down with integer math and clamps to the agreed bounds', () => {
    expect(principal('0.000001', 'USD')).toBe(100_000n);
    expect(principal('1', 'USD')).toBe(100_000n);
    expect(principal('9.999999', 'USD')).toBe(999_999n);
    expect(principal('10', 'USD')).toBe(1_000_000n);
    expect(principal('999999999999', 'USD')).toBe(1_000_000n);
    expect(principal('2.345678', 'EUR')).toBe(258_024n);
    expect(formatMicro(principal('2', 'EUR'))).toBe('0.22');
  });
  it.each(['0', '-1', '1e3', '01', '1.', '.1', 'NaN', 'Infinity', '0.0000001', ' 1', '1\n'])('rejects %s', amount => {
    expect(() => parseAmount(amount)).toThrow();
  });
});

describe('budget safety foundation (not connected to execution)', () => {
  const budget = { principalMicro: 1_000_000n, maximumGasNative: 1n,
    balanceNative: 10n ** 19n, spentTodayMicro: 4_000_000n, reservations: [] };
  it('allows exactly the cap and rejects one micro-unit over', () => {
    expect(() => checkBudget(budget)).not.toThrow();
    expect(() => checkBudget({ ...budget, spentTodayMicro: 4_000_001n })).toThrow('Daily cap');
  });
  it('retains unresolved exposure from yesterday after Madrid midnight', () => {
    expect(madridDay(new Date('2026-09-12T21:59:59Z'))).toBe('2026-09-12');
    expect(madridDay(new Date('2026-09-12T22:00:00Z'))).toBe('2026-09-13');
    const old = { principalMicro: 4_000_001n, maximumGasNative: 1n, budgetDay: '2026-09-12', uncertain: false };
    expect(() => checkBudget({ ...budget, spentTodayMicro: 0n, reservations: [old] })).toThrow('Daily cap');
    expect(() => checkBudget({ ...budget, spentTodayMicro: 0n, reservations: [{ ...old, principalMicro: 1n, uncertain: true }] })).toThrow('Unresolved transaction');
  });
  it('preserves reserve after worst-case new and outstanding gas', () => {
    const boundary = { ...budget, balanceNative: 2n * 10n ** 18n + 1n };
    expect(() => checkBudget(boundary)).not.toThrow();
    expect(() => checkBudget({ ...boundary, balanceNative: boundary.balanceNative - 1n })).toThrow('reserve');
    expect(() => checkBudget({ ...budget, spentTodayMicro: 0n, balanceNative: 3n * 10n ** 18n + 1n,
      reservations: [{ principalMicro: 1_000_000n, maximumGasNative: 1n, budgetDay: '2026-09-11', uncertain: false }] })).toThrow('reserve');
  });
});
