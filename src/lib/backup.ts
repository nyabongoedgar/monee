/**
 * Backup export/import. A backup is a file the user saves via the share sheet.
 *
 *  - Plain:      { format: 'monee-backup', ... }                 (readable JSON)
 *  - Encrypted:  { format: 'monee-backup-encrypted', ... }       (PBKDF2 + AES-GCM under a passphrase)
 *
 * Imports are validated with zod before anything is written.
 */
import { z } from "zod"
import {
  getProfile,
  listAccounts,
  listBudgets,
  listCategories,
  listGoals,
  listRecurring,
  listTransactions,
  writeBackupRecords,
} from "@/db/repos"
import type {
  Account,
  Budget,
  Category,
  Goal,
  Profile,
  Recurring,
  Transaction,
} from "@/db/types"
import {
  deriveKek,
  DEFAULT_ITERATIONS,
  fromBase64,
  randomBytes,
  sealBytes,
  openBytes,
  toBase64,
} from "@/security/crypto"
import { toInputValue } from "./money"

export const BACKUP_VERSION = 1
const PLAIN_FORMAT = "monee-backup"
const ENCRYPTED_FORMAT = "monee-backup-encrypted"

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const amount = z.number().int().nonnegative()
const id = z.string().min(1).max(64)

const ProfileSchema = z.object({
  id: z.literal("me"),
  firstName: z.string().max(60),
  lastName: z.string().max(60),
  email: z.string().max(120),
  currency: z.string().regex(/^[A-Z]{3}$/),
  createdAt: z.string(),
  avatarColor: z.string(),
})

const AccountSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  type: z.enum(["cash", "bank", "mobile", "savings", "other"]),
  openingBalance: z.number().int(),
  color: z.string(),
  icon: z.string(),
  archived: z.boolean(),
  sortOrder: z.number().int(),
})

const CategorySchema = z.object({
  id,
  name: z.string().min(1).max(60),
  kind: z.enum(["expense", "income"]),
  icon: z.string(),
  color: z.string(),
  isDefault: z.boolean(),
  archived: z.boolean(),
})

const TransactionSchema = z.object({
  id,
  type: z.enum(["expense", "income", "transfer", "goal"]),
  amount: amount.positive(),
  accountId: id,
  toAccountId: id.optional(),
  categoryId: id.optional(),
  date: dayString,
  note: z.string().max(500).optional(),
  recurringId: id.optional(),
  goalId: id.optional(),
  withdraw: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const BudgetSchema = z.object({
  id,
  month: z.string().regex(/^\d{4}-\d{2}$/),
  categoryId: id.nullable(),
  limit: amount.positive(),
})

const GoalSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  target: amount.positive(),
  icon: z.string(),
  color: z.string(),
  deadline: dayString.optional(),
  archived: z.boolean(),
  createdAt: z.string(),
})

const RecurringSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  type: z.enum(["expense", "income"]),
  amount: amount.positive(),
  accountId: id,
  categoryId: id.optional(),
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  anchorDay: z.number().int().min(1).max(31),
  startDate: dayString,
  endDate: dayString.optional(),
  nextDue: dayString,
  active: z.boolean(),
})

const DataSchema = z.object({
  profile: ProfileSchema.nullable().optional(),
  accounts: z.array(AccountSchema),
  categories: z.array(CategorySchema),
  transactions: z.array(TransactionSchema),
  budgets: z.array(BudgetSchema),
  goals: z.array(GoalSchema),
  recurring: z.array(RecurringSchema),
})

const PlainSchema = z.object({
  format: z.literal(PLAIN_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  data: DataSchema,
})

export type BackupData = z.infer<typeof DataSchema>

export class PassphraseRequiredError extends Error {
  constructor() {
    super("This backup is encrypted. Enter its passphrase.")
  }
}

export class WrongPassphraseError extends Error {
  constructor() {
    super("That passphrase does not open this backup.")
  }
}

export async function collectBackup(): Promise<BackupData> {
  const [
    profile,
    accounts,
    categories,
    transactions,
    budgets,
    goals,
    recurring,
  ] = await Promise.all([
    getProfile(),
    listAccounts(true),
    listCategories(),
    listTransactions(),
    listBudgets(),
    listGoals(true),
    listRecurring(),
  ])
  return {
    profile: profile ?? null,
    accounts,
    categories,
    transactions,
    budgets,
    goals,
    recurring,
  }
}

export async function serializeBackup(
  data: BackupData,
  passphrase?: string,
): Promise<string> {
  const exportedAt = new Date().toISOString()
  if (!passphrase) {
    return JSON.stringify(
      { format: PLAIN_FORMAT, version: BACKUP_VERSION, exportedAt, data },
      null,
      2,
    )
  }
  const salt = randomBytes(16)
  const key = await deriveKek(passphrase, salt, DEFAULT_ITERATIONS)
  const payload = await sealBytes(
    key,
    new TextEncoder().encode(JSON.stringify({ exportedAt, data })),
  )
  return JSON.stringify({
    format: ENCRYPTED_FORMAT,
    version: BACKUP_VERSION,
    iterations: DEFAULT_ITERATIONS,
    salt: toBase64(salt),
    payload: toBase64(payload),
  })
}

/** Parses and validates a backup file. Throws PassphraseRequiredError or WrongPassphraseError for encrypted files. */
export async function parseBackup(
  text: string,
  passphrase?: string,
): Promise<BackupData> {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error("This file is not a monee backup.")
  }
  const header = z.object({ format: z.string() }).safeParse(json)
  if (
    !header.success ||
    ![PLAIN_FORMAT, ENCRYPTED_FORMAT].includes(header.data.format)
  ) {
    throw new Error("This file is not a monee backup.")
  }

  if (header.data.format === ENCRYPTED_FORMAT) {
    if (!passphrase) throw new PassphraseRequiredError()
    const enc = z
      .object({
        iterations: z.number().int().positive(),
        salt: z.string(),
        payload: z.string(),
      })
      .parse(json)
    let inner: { exportedAt: string; data: unknown }
    try {
      const key = await deriveKek(
        passphrase,
        fromBase64(enc.salt),
        enc.iterations,
      )
      inner = JSON.parse(
        new TextDecoder().decode(await openBytes(key, fromBase64(enc.payload))),
      )
    } catch {
      // Wrong passphrase fails GCM authentication, which lands here.
      throw new WrongPassphraseError()
    }
    json = {
      format: PLAIN_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: inner.exportedAt,
      data: inner.data,
    }
  }

  const parsed = PlainSchema.safeParse(json)
  if (!parsed.success)
    throw new Error(
      "The backup file is damaged or from an unsupported version.",
    )
  return parsed.data.data
}

export function summarizeBackup(data: BackupData) {
  const dates = data.transactions.map((t) => t.date).sort()
  return {
    accounts: data.accounts.length,
    categories: data.categories.length,
    transactions: data.transactions.length,
    budgets: data.budgets.length,
    goals: data.goals.length,
    recurring: data.recurring.length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
  }
}

/**
 * Writes a backup into the local database, re-encrypting each record under the current data key.
 * "replace" wipes the financial data first. "merge" adds and overwrites by id, and never deletes.
 * The whole write is one transaction, so an interruption can't leave a half-restored database.
 */
export async function restoreBackup(
  data: BackupData,
  mode: "replace" | "merge",
): Promise<void> {
  await writeBackupRecords(
    {
      profile: mode === "replace" ? (data.profile as Profile | null) : null,
      accounts: data.accounts as Account[],
      categories: data.categories as Category[],
      transactions: data.transactions as Transaction[],
      budgets: data.budgets as Budget[],
      goals: data.goals as Goal[],
      recurring: data.recurring as Recurring[],
    },
    mode,
  )
}

export function toCsv(data: BackupData, currency: string): string {
  const accountName = (id?: string) =>
    data.accounts.find((a) => a.id === id)?.name ?? ""
  const categoryName = (id?: string) =>
    data.categories.find((c) => c.id === id)?.name ?? ""
  const goalName = (id?: string) =>
    data.goals.find((g) => g.id === id)?.name ?? ""
  const escape = (value: string) => {
    // Spreadsheets run cells that start with these characters as formulas, so neutralise them.
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const header = [
    "Date",
    "Type",
    "Amount",
    "Account",
    "To account",
    "Category",
    "Goal",
    "Note",
  ]
  const rows = [...data.transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) =>
      [
        t.date,
        t.type,
        toInputValue(t.amount, currency),
        accountName(t.accountId),
        accountName(t.toAccountId),
        categoryName(t.categoryId),
        goalName(t.goalId),
        t.note ?? "",
      ]
        .map(escape)
        .join(","),
    )
  return [header.join(","), ...rows].join("\n")
}

export const BACKUP_FILE_EXTENSION = "monee"
