import { useLiveQuery } from "dexie-react-hooks"
import {
  listAccounts,
  listBudgets,
  listCategories,
  listGoals,
  listRecurring,
  listTransactions,
} from "@/db/repos"
import type {
  Account,
  Budget,
  Category,
  Goal,
  Recurring,
  Transaction,
} from "@/db/types"
import { accountBalances, goalSaved } from "@/lib/ledger"

/** Loads everything the dashboards need. Live: any write elsewhere updates these lists. */
export function useFinance() {
  const accounts = useLiveQuery(() => listAccounts(true), [])
  const transactions = useLiveQuery(() => listTransactions(), [])
  const categories = useLiveQuery(() => listCategories(), [])
  const budgets = useLiveQuery(() => listBudgets(), [])
  const goals = useLiveQuery(() => listGoals(true), [])
  const recurring = useLiveQuery(() => listRecurring(), [])

  const ready = Boolean(
    accounts && transactions && categories && budgets && goals && recurring,
  )
  return {
    ready,
    accounts: (accounts ?? []) as Account[],
    transactions: (transactions ?? []) as Transaction[],
    categories: (categories ?? []) as Category[],
    budgets: (budgets ?? []) as Budget[],
    goals: (goals ?? []) as Goal[],
    recurring: (recurring ?? []) as Recurring[],
  }
}

/** Total of active accounts plus money set aside in goals (archived goals still hold their money). */
export function totalWorth(
  accounts: Account[],
  goals: Goal[],
  transactions: Transaction[],
) {
  const balances = accountBalances(accounts, transactions)
  const inAccounts = accounts
    .filter((a) => !a.archived)
    .reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0)
  const inGoals = goals.reduce(
    (sum, g) => sum + goalSaved(g.id, transactions),
    0,
  )
  return { inAccounts, inGoals, total: inAccounts + inGoals }
}
