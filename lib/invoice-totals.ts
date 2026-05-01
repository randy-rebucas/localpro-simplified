import { roundMoney } from "@/lib/rate-engine";

export function sumInvoiceLines(lines: { amount: number }[]): number {
  return roundMoney(lines.reduce((s, x) => s + x.amount, 0));
}

export function invoiceBalance(total: number, paid: number): number {
  return roundMoney(Math.max(0, total - paid));
}
