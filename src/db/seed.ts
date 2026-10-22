import type { Account, Category } from "./types"
import { db } from "./schema"
import { saveAccount } from "./repos"

export const newId = (): string => crypto.randomUUID()

export const DEFAULT_CATEGORIES: Omit<Category, "id">[] = [
  {
    name: "Housing",
    kind: "expense",
    icon: "home",
    color: "coral",
    isDefault: true,
    archived: false,
  },
  {
    name: "Food & drinks",
    kind: "expense",
    icon: "coffee",
    color: "green",
    isDefault: true,
    archived: false,
  },
  {
    name: "Shopping",
    kind: "expense",
    icon: "cart",
    color: "purple",
    isDefault: true,
    archived: false,
  },
  {
    name: "Transport",
    kind: "expense",
    icon: "car",
    color: "blue",
    isDefault: true,
    archived: false,
  },
  {
    name: "Bills",
    kind: "expense",
    icon: "receipt",
    color: "orange",
    isDefault: true,
    archived: false,
  },
  {
    name: "Health",
    kind: "expense",
    icon: "heart",
    color: "green",
    isDefault: true,
    archived: false,
  },
  {
    name: "Entertainment",
    kind: "expense",
    icon: "film",
    color: "purple",
    isDefault: true,
    archived: false,
  },
  {
    name: "Other",
    kind: "expense",
    icon: "dots",
    color: "gray",
    isDefault: true,
    archived: false,
  },
  {
    name: "Salary",
    kind: "income",
    icon: "briefcase",
    color: "green",
    isDefault: true,
    archived: false,
  },
  {
    name: "Other income",
    kind: "income",
    icon: "sparkles",
    color: "sand",
    isDefault: true,
    archived: false,
  },
]

/** Default categories and a starter Cash account, written once at onboarding. */
export async function seedDefaults(): Promise<void> {
  const existing = await db.categories.count()
  if (existing === 0) {
    await db.categories.bulkPut(
      DEFAULT_CATEGORIES.map((c) => ({ ...c, id: newId() })),
    )
  }
  const accounts = await db.accounts.count()
  if (accounts === 0) {
    const cash: Account = {
      id: newId(),
      name: "Cash",
      type: "cash",
      openingBalance: 0,
      color: "green",
      icon: "wallet",
      archived: false,
      sortOrder: 0,
    }
    await saveAccount(cash)
  }
}
