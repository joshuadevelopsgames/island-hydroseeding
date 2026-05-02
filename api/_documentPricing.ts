/** Money and tax helpers — tax_rate is a decimal fraction (e.g. 0.05 = 5%). */

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function lineTotal(quantity: number, unitPrice: number): number {
  return roundMoney(Number(quantity) * Number(unitPrice));
}

export function documentTotalsFromSubtotal(subtotal: number, taxRateDecimal: number) {
  const s = roundMoney(subtotal);
  const tax_amount = roundMoney(s * Number(taxRateDecimal) || 0);
  const total = roundMoney(s + tax_amount);
  return { subtotal: s, tax_amount, total };
}

export const MONEY_EPS = 0.005;

export function balancesMatch(a: number, b: number, eps = MONEY_EPS): boolean {
  return Math.abs(Number(a) - Number(b)) <= eps;
}
