/**
 * Rule-based insights computed locally. No AI, no network.
 */
import type { Category } from "@/db/types"
import { formatMoney, percentChange } from "./money"

export interface Insight {
  tone: "good" | "warn" | "info"
  title: string
  body: string
}

export interface InsightInput {
  currency: string
  periodName: string // e.g. "this week"
  current: Map<string, number>
  previous: Map<string, number>
  categories: Category[]
  overallBudget?: { limit: number; used: number; daysLeft: number }
  daysSinceLastExpense: number
}

const MIN_CHANGE_AMOUNT_RATIO = 0.05

export function buildInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = []
  const name = (id: string) =>
    input.categories.find((c) => c.id === id)?.name ?? "Uncategorised"

  // Biggest category movement vs the previous period.
  let best: { id: string; change: number; pct: number } | null = null
  for (const [id, amount] of input.current) {
    const prev = input.previous.get(id) ?? 0
    const pct = percentChange(amount, prev)
    if (pct === null || Math.abs(pct) < 10) continue
    const total = [...input.current.values()].reduce((a, b) => a + b, 0)
    if (Math.abs(amount - prev) < total * MIN_CHANGE_AMOUNT_RATIO) continue
    if (!best || Math.abs(pct) > Math.abs(best.pct))
      best = { id, change: amount - prev, pct }
  }
  if (best) {
    const down = best.pct < 0
    insights.push({
      tone: down ? "good" : "warn",
      title: down ? "Nice work" : "Heads up",
      body: `You spent ${Math.abs(best.pct)}% ${
        down ? "less" : "more"
      } on ${name(best.id).toLowerCase()} ${input.periodName}.`,
    })
  }

  if (input.overallBudget && input.overallBudget.limit > 0) {
    const { limit, used, daysLeft } = input.overallBudget
    const ratio = used / limit
    if (ratio > 1) {
      insights.push({
        tone: "warn",
        title: "Over budget",
        body: `You are ${formatMoney(used - limit, input.currency)} over this month's budget.`,
      })
    } else if (ratio >= 0.85) {
      insights.push({
        tone: "warn",
        title: "Budget almost used",
        body: `${Math.round(ratio * 100)}% used with ${daysLeft} day${
          daysLeft === 1 ? "" : "s"
        } left.`,
      })
    }
  }

  if (input.daysSinceLastExpense >= 3) {
    insights.push({
      tone: "good",
      title: "No-spend streak",
      body: `No expenses for ${input.daysSinceLastExpense} days. Keep it going.`,
    })
  }

  if (insights.length === 0 && input.current.size > 0) {
    let topId = ""
    let top = 0
    for (const [id, amount] of input.current)
      if (amount > top) [topId, top] = [id, amount]
    insights.push({
      tone: "info",
      title: "Top category",
      body: `${name(topId)} is your biggest spend ${input.periodName}.`,
    })
  }

  return insights
}
