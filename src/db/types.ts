/** Domain types. Sensitive fields are stored encrypted (see db/sealed.ts); these are the decrypted shapes. */

export type AccountType = "cash" | "bank" | "mobile" | "savings" | "other"
export type CategoryKind = "expense" | "income"
/** `goal` = money moved into (or out of, when `withdraw`) a savings goal. Not spending. */
export type TxType = "expense" | "income" | "transfer" | "goal"
export type Frequency = "weekly" | "monthly" | "yearly"

export interface Profile {
  id: "me"
  firstName: string
  lastName: string
  email: string
  currency: string
  createdAt: string
  avatarColor: string
}

export interface Account {
  id: string
  name: string
  type: AccountType
  openingBalance: number
  color: string
  icon: string
  archived: boolean
  sortOrder: number
}

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  icon: string
  color: string
  isDefault: boolean
  archived: boolean
}

export interface Transaction {
  id: string
  type: TxType
  /** Always positive, in minor units. Direction comes from `type`. */
  amount: number
  accountId: string
  toAccountId?: string
  categoryId?: string
  /** YYYY-MM-DD */
  date: string
  note?: string
  recurringId?: string
  goalId?: string
  withdraw?: boolean
  createdAt: string
  updatedAt: string
}

export interface Budget {
  id: string
  /** YYYY-MM */
  month: string
  /** null = overall monthly budget */
  categoryId: string | null
  limit: number
}

export interface Goal {
  id: string
  name: string
  target: number
  icon: string
  color: string
  deadline?: string
  archived: boolean
  createdAt: string
}

export interface Recurring {
  id: string
  name: string
  type: "expense" | "income"
  amount: number
  accountId: string
  categoryId?: string
  frequency: Frequency
  anchorDay: number
  startDate: string
  endDate?: string
  nextDue: string
  active: boolean
}

export interface Settings {
  id: "app"
  weekStart: 0 | 1
  hideBalances: boolean
  monthlySavingsTarget: number
  lastBackupAt?: string
  installPromptDismissedAt?: string
  schemaVersion: number
}

export interface PasskeyInfo {
  credentialId: string
  prfSalt: string
  wrappedDekByPrf: string
}

export interface SecurityMeta {
  id: "sec"
  salt: string
  iterations: number
  wrappedDek: string
  /** [TEST] Present only when the build had VITE_TEST_MASTER_PIN=true. */
  masterSalt?: string
  masterWrappedDek?: string
  passkey?: PasskeyInfo
  lockAfterSec: number
  failedAttempts: number
  lockedUntil: number | null
}
