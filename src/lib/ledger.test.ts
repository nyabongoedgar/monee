import { describe, expect, it } from "vitest"
import type { Account, Budget, Transaction } from "@/db/types"
import {
  accountBalance,
  budgetUsed,
  goalSaved,
  spendByCategory,
  totalsIn,
} from "./ledger"
import { periodOf, fromDay } from "./dates"

const cash: Account = {
  id: "cash",
  name: "Cash",
  type: "cash",
  openingBalance: 10000,
  color: "",
  icon: "",
  archived: false,
  sortOrder: 0,
}
const bank: Account = {
  id: "bank",
  name: "Bank",
  type: "bank",
  openingBalance: 0,
  color: "",
  icon: "",
  archived: false,
  sortOrder: 1,
}

let n = 0
function tx(
  partial: Partial<Transaction> & Pick<Transaction, "type" | "amount" | "accountId" | "date">,
): Transaction {
  n++
  return { id: `t${n}`, createdAt: "", updatedAt: "", ...partial }
}

describe("account balances", () => {
  const txns = [
    tx({
      type: "expense",
      amount: 2500,
      accountId: "cash",
      date: "2026-10-01",
    }),
    tx({ type: "income", amount: 5000, accountId: "bank", date: "2026-10-02" }),
    tx({
      type: "transfer",
      amount: 1000,
      accountId: "bank",
      toAccountId: "cash",
      date: "2026-10-03",
    }),
    tx({
      type: "goal",
      amount: 3000,
      accountId: "bank",
      goalId: "g",
      date: "2026-10-04",
    }),
  ]

  it("applies income, expenses and transfers in both directions", () => {
    expect(accountBalance(cash, txns)).toBe(10000 - 2500 + 1000)
    expect(accountBalance(bank, txns)).toBe(5000 - 1000 - 3000)
  })

  it("moves goal deposits out of the account and withdrawals back in", () => {
    const withdrawal = tx({
      type: "goal",
      amount: 500,
      accountId: "bank",
      goalId: "g",
      withdraw: true,
      date: "2026-10-05",
    })
    expect(accountBalance(bank, [...txns, withdrawal])).toBe(
      5000 - 1000 - 3000 + 500,
    )
  })
})

describe("goals", () => {
  it("sums deposits minus withdrawals per goal", () => {
    const txns = [
      tx({
        type: "goal",
        amount: 4000,
        accountId: "bank",
        goalId: "g1",
        date: "2026-10-01",
      }),
      tx({
        type: "goal",
        amount: 1000,
        accountId: "bank",
        goalId: "g1",
        withdraw: true,
        date: "2026-10-02",
      }),
      tx({
        type: "goal",
        amount: 999,
        accountId: "bank",
        goalId: "g2",
        date: "2026-10-02",
      }),
    ]
    expect(goalSaved("g1", txns)).toBe(3000)
    expect(goalSaved("g2", txns)).toBe(999)
  })
})

describe("spending", () => {
  const txns = [
    tx({
      type: "expense",
      amount: 700,
      accountId: "cash",
      categoryId: "food",
      date: "2026-10-05",
    }),
    tx({ type: "expense", amount: 300, accountId: "cash", date: "2026-10-06" }),
    tx({ type: "income", amount: 9000, accountId: "bank", date: "2026-10-07" }),
    tx({
      type: "transfer",
      amount: 4000,
      accountId: "bank",
      toAccountId: "cash",
      date: "2026-10-07",
    }),
    tx({
      type: "goal",
      amount: 2000,
      accountId: "bank",
      goalId: "g",
      date: "2026-10-08",
    }),
    tx({
      type: "expense",
      amount: 100,
      accountId: "cash",
      categoryId: "food",
      date: "2026-09-30",
    }),
  ]
  const october = periodOf("month", fromDay("2026-10-15"))

  it("counts only expenses and income in totals", () => {
    expect(totalsIn(october, txns)).toEqual({ income: 9000, expense: 1000 })
  })

  it("groups expenses by category, with uncategorised under empty key", () => {
    const map = spendByCategory(october, txns)
    expect(map.get("food")).toBe(700)
    expect(map.get("")).toBe(300)
  })

  it("counts budget spend only for its month and category", () => {
    const food: Budget = {
      id: "b",
      month: "2026-10",
      categoryId: "food",
      limit: 5000,
    }
    const overall: Budget = {
      id: "o",
      month: "2026-10",
      categoryId: null,
      limit: 5000,
    }
    expect(budgetUsed(food, txns)).toBe(700)
    expect(budgetUsed(overall, txns)).toBe(1000)
  })
})
