/**
 * Pure derivations over transactions. Nothing here is stored: balances, budgets,
 * goal progress and period totals are always recomputed, so they can't go stale.
 */
import type { Account, Budget, Transaction } from "@/db/types"
import { inPeriod, type Period } from "./dates"

export function accountBalance(
  account: Account,
  transactions: Transaction[],
): number {
  let balance = account.openingBalance
  for (const t of transactions) {
    if (t.type === "income" && t.accountId === account.id) balance += t.amount
    if (t.type === "expense" && t.accountId === account.id) balance -= t.amount
    if (t.type === "transfer") {
      if (t.accountId === account.id) balance -= t.amount
      if (t.toAccountId === account.id) balance += t.amount
    }
    if (t.type === "goal" && t.accountId === account.id)
      balance += t.withdraw ? t.amount : -t.amount
  }
  return balance
}

export function accountBalances(
  accounts: Account[],
  transactions: Transaction[],
): Map<string, number> {
  return new Map(accounts.map((a) => [a.id, accountBalance(a, transactions)]))
}

/** Money currently saved towards a goal (deposits minus withdrawals). */
export function goalSaved(goalId: string, transactions: Transaction[]): number {
  return transactions.reduce((sum, t) => {
    if (t.type !== "goal" || t.goalId !== goalId) return sum
    return sum + (t.withdraw ? -t.amount : t.amount)
  }, 0)
}

export interface Totals {
  income: number
  expense: number
}

export function totalsIn(period: Period, transactions: Transaction[]): Totals {
  const totals: Totals = { income: 0, expense: 0 }
  for (const t of transactions) {
    if (!inPeriod(t.date, period)) continue
    if (t.type === "income") totals.income += t.amount
    if (t.type === "expense") totals.expense += t.amount
  }
  return totals
}

/** Expense amount per category id within a period (uncategorised goes under '').*/
export function spendByCategory(
  period: Period,
  transactions: Transaction[],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== "expense" || !inPeriod(t.date, period)) continue
    const key = t.categoryId ?? ""
    map.set(key, (map.get(key) ?? 0) + t.amount)
  }
  return map
}

/** Spend counted against a budget for a given month (`YYYY-MM`). */
export function budgetUsed(
  budget: Budget,
  transactions: Transaction[],
): number {
  return transactions.reduce((sum, t) => {
    if (t.type !== "expense" || !t.date.startsWith(budget.month)) return sum
    if (budget.categoryId !== null && t.categoryId !== budget.categoryId)
      return sum
    return sum + t.amount
  }, 0)
}
