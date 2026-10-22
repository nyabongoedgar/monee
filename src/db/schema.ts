import Dexie, { type Table } from "dexie"
import type {
  Account,
  Budget,
  Category,
  Goal,
  Profile,
  Recurring,
  SecurityMeta,
  Settings,
  Transaction,
} from "./types"

/**
 * Rows keep index-friendly fields in clear and put sensitive fields in `sealed`
 * (AES-GCM under the data key). Only the repository layer reads or writes rows.
 */
export type Sealed<T> = Omit<T, SensitiveKeys<T>> & { sealed: string }
type SensitiveKeys<T> = Extract<keyof T, "firstName" | "lastName" | "email" | "name" | "openingBalance" | "amount" | "note" | "limit" | "target" | "deadline">

export class MoneeDB extends Dexie {
  profile!: Table<Sealed<Profile>, string>
  security!: Table<SecurityMeta, string>
  settings!: Table<Settings, string>
  accounts!: Table<Sealed<Account>, string>
  categories!: Table<Category, string>
  transactions!: Table<Sealed<Transaction>, string>
  budgets!: Table<Sealed<Budget>, string>
  goals!: Table<Sealed<Goal>, string>
  recurring!: Table<Sealed<Recurring>, string>

  constructor(name = "monee") {
    super(name)
    this.version(1).stores({
      profile: "id",
      security: "id",
      settings: "id",
      accounts: "id, sortOrder",
      categories: "id, kind",
      transactions:
        "id, date, type, accountId, categoryId, goalId, recurringId, [type+date], [accountId+date], [categoryId+date]",
      budgets: "id, month, categoryId",
      goals: "id",
      recurring: "id, nextDue",
    })
  }
}

export const SCHEMA_VERSION = 1

export const db = new MoneeDB()
