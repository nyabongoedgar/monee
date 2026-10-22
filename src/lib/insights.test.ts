import { describe, expect, it } from "vitest"
import type { Category } from "@/db/types"
import { buildInsights } from "./insights"

const categories: Category[] = [
  {
    id: "food",
    name: "Food & drinks",
    kind: "expense",
    icon: "coffee",
    color: "green",
    isDefault: true,
    archived: false,
  },
]

describe("insights", () => {
  it("celebrates a meaningful drop in a category", () => {
    const [first] = buildInsights({
      currency: "UGX",
      periodName: "this week",
      current: new Map([["food", 88000]]),
      previous: new Map([["food", 100000]]),
      categories,
      daysSinceLastExpense: 0,
    })
    expect(first.tone).toBe("good")
    expect(first.body).toBe("You spent 12% less on food & drinks this week.")
  })

  it("warns when the overall budget is exceeded", () => {
    const insights = buildInsights({
      currency: "UGX",
      periodName: "this month",
      current: new Map(),
      previous: new Map(),
      categories,
      overallBudget: { limit: 100000, used: 120000, daysLeft: 9 },
      daysSinceLastExpense: 0,
    })
    expect(insights[0]).toMatchObject({ tone: "warn", title: "Over budget" })
  })

  it("stays quiet rather than inventing advice", () => {
    expect(
      buildInsights({
        currency: "UGX",
        periodName: "this week",
        current: new Map(),
        previous: new Map(),
        categories,
        daysSinceLastExpense: 0,
      }),
    ).toEqual([])
  })
})
