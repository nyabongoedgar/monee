/**
 * Repository layer: the only module that talks to Dexie directly.
 * Reads decrypt, writes encrypt. Callers always get plain domain objects.
 */
import { db, SCHEMA_VERSION } from "./schema"
import { fromRow, toRow } from "./sealed"
import type {
  Account,
  Budget,
  Category,
  Goal,
  Profile,
  Recurring,
  Settings,
  Transaction,
} from "./types"

const DEFAULT_SETTINGS: Settings = {
  id: "app",
  weekStart: 1,
  hideBalances: false,
  monthlySavingsTarget: 0,
  schemaVersion: SCHEMA_VERSION,
}

export const SECRET = {
  profile: ["firstName", "lastName", "email"] as const,
  account: ["name", "openingBalance"] as const,
  transaction: ["amount", "note"] as const,
  budget: ["limit"] as const,
  goal: ["name", "target", "deadline"] as const,
  recurring: ["name", "amount"] as const,
}

/** Removes every row. Only used when setup starts over, so nothing is left unreadable. */
export async function clearAllData(): Promise<void> {
  await db.transaction("rw", db.tables, () =>
    Promise.all(db.tables.map((table) => table.clear())),
  )
}

// ---- Profile & settings ----------------------------------------------------

export async function getProfile(): Promise<Profile | undefined> {
  const row = await db.profile.get("me")
  return row ? fromRow<Profile>(row) : undefined
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.profile.put((await toRow(profile, SECRET.profile)) as never)
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get("app")) ?? DEFAULT_SETTINGS
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await db.settings.put({ ...(await getSettings()), ...patch, id: "app" })
}

// ---- Accounts ----------------------------------------------------------------

export async function listAccounts(
  includeArchived = false,
): Promise<Account[]> {
  const rows = await db.accounts.orderBy("sortOrder").toArray()
  const accounts = await Promise.all(
    rows.map((r) => fromRow<Account>(r as never)),
  )
  return includeArchived ? accounts : accounts.filter((a) => !a.archived)
}

export async function saveAccount(account: Account): Promise<void> {
  await db.accounts.put((await toRow(account, SECRET.account)) as never)
}

export async function deleteAccount(id: string): Promise<void> {
  await db.accounts.delete(id)
}

// ---- Categories (not sensitive: stored in clear) ------------------------------

export async function listCategories(): Promise<Category[]> {
  return db.categories.toArray()
}

export async function saveCategory(category: Category): Promise<void> {
  await db.categories.put(category)
}

// ---- Transactions --------------------------------------------------------------

export async function listTransactions(): Promise<Transaction[]> {
  const rows = await db.transactions.orderBy("date").reverse().toArray()
  return Promise.all(rows.map((r) => fromRow<Transaction>(r as never)))
}

export async function getTransaction(
  id: string,
): Promise<Transaction | undefined> {
  const row = await db.transactions.get(id)
  return row ? fromRow<Transaction>(row as never) : undefined
}

export async function saveTransaction(transaction: Transaction): Promise<void> {
  await db.transactions.put(
    (await toRow(transaction, SECRET.transaction)) as never,
  )
}

export async function saveTransactions(
  transactions: Transaction[],
): Promise<void> {
  const rows = await Promise.all(
    transactions.map((t) => toRow(t, SECRET.transaction)),
  )
  await db.transactions.bulkPut(rows as never)
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id)
}

// ---- Budgets ---------------------------------------------------------------------

export async function listBudgets(): Promise<Budget[]> {
  const rows = await db.budgets.toArray()
  return Promise.all(rows.map((r) => fromRow<Budget>(r as never)))
}

export async function saveBudget(budget: Budget): Promise<void> {
  await db.budgets.put((await toRow(budget, SECRET.budget)) as never)
}

export async function deleteBudget(id: string): Promise<void> {
  await db.budgets.delete(id)
}

// ---- Goals -----------------------------------------------------------------------

export async function listGoals(includeArchived = false): Promise<Goal[]> {
  const rows = await db.goals.toArray()
  const goals = await Promise.all(rows.map((r) => fromRow<Goal>(r as never)))
  return includeArchived ? goals : goals.filter((g) => !g.archived)
}

export async function saveGoal(goal: Goal): Promise<void> {
  await db.goals.put((await toRow(goal, SECRET.goal)) as never)
}

export async function deleteGoal(id: string): Promise<void> {
  await db.goals.delete(id)
}

// ---- Recurring -------------------------------------------------------------------

export async function listRecurring(): Promise<Recurring[]> {
  const rows = await db.recurring.toArray()
  return Promise.all(rows.map((r) => fromRow<Recurring>(r as never)))
}

export async function saveRecurring(item: Recurring): Promise<void> {
  await db.recurring.put((await toRow(item, SECRET.recurring)) as never)
}

export async function deleteRecurring(id: string): Promise<void> {
  await db.recurring.delete(id)
}

// ---- Multi-table writes -------------------------------------------------------------

/**
 * Records a recurring payment and moves its due date forward in one transaction.
 * Rows are encrypted before the transaction opens, so a failure can't leave a posted
 * payment with the old due date (which would post it again on retry).
 */
export async function recordRecurringPayment(
  transaction: Transaction,
  item: Recurring,
): Promise<void> {
  const txRow = await toRow(transaction, SECRET.transaction)
  const itemRow = await toRow(item, SECRET.recurring)
  await db.transaction("rw", [db.transactions, db.recurring], async () => {
    await db.transactions.put(txRow as never)
    await db.recurring.put(itemRow as never)
  })
}

export interface BackupRecords {
  profile: Profile | null
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  budgets: Budget[]
  goals: Goal[]
  recurring: Recurring[]
}

/**
 * Writes a whole backup in one transaction. Rows are encrypted first, so the write
 * either lands completely or not at all. "replace" clears the financial tables first.
 */
export async function writeBackupRecords(
  records: BackupRecords,
  mode: "replace" | "merge",
): Promise<void> {
  const [accounts, transactions, budgets, goals, recurring] = await Promise.all([
    Promise.all(records.accounts.map((a) => toRow(a, SECRET.account))),
    Promise.all(records.transactions.map((t) => toRow(t, SECRET.transaction))),
    Promise.all(records.budgets.map((b) => toRow(b, SECRET.budget))),
    Promise.all(records.goals.map((g) => toRow(g, SECRET.goal))),
    Promise.all(records.recurring.map((r) => toRow(r, SECRET.recurring))),
  ])
  const profile =
    mode === "replace" && records.profile
      ? await toRow(records.profile, SECRET.profile)
      : null

  await db.transaction("rw", db.tables, async () => {
    if (mode === "replace") {
      await Promise.all([
        db.accounts.clear(),
        db.categories.clear(),
        db.transactions.clear(),
        db.budgets.clear(),
        db.goals.clear(),
        db.recurring.clear(),
      ])
      if (profile) await db.profile.put(profile as never)
    }
    await Promise.all([
      db.accounts.bulkPut(accounts as never),
      db.categories.bulkPut(records.categories),
      db.transactions.bulkPut(transactions as never),
      db.budgets.bulkPut(budgets as never),
      db.goals.bulkPut(goals as never),
      db.recurring.bulkPut(recurring as never),
    ])
  })
}
