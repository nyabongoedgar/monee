import { useMemo, useState } from "react"
import { useAppData } from "@/app/AppData"
import { useFinance } from "@/app/useFinance"
import { useUi } from "@/app/ui"
import { EmptyState, SubPage } from "@/components/common"
import { Icon } from "@/components/Icon"
import { dayLabel, TransactionRow } from "@/components/TransactionRow"
import type { Transaction, TxType } from "@/db/types"
import { toInputValue } from "@/lib/money"

type Filter = "all" | TxType

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "expense", label: "Spending" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfers" },
  { value: "goal", label: "Savings" },
]

export function ActivityScreen() {
  const { currency } = useAppData()
  const { ready, transactions, categories, accounts } = useFinance()
  const openSheet = useUi((s) => s.openSheet)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (t: Transaction) => {
      if (filter !== "all" && t.type !== filter) return false
      if (!q) return true
      const category = categories.find((c) => c.id === t.categoryId)?.name ?? ""
      const account = accounts.find((a) => a.id === t.accountId)?.name ?? ""
      return [
        t.note ?? "",
        category,
        account,
        toInputValue(t.amount, currency),
        t.date,
      ].some((field) => field.toLowerCase().includes(q))
    }
    const byDay = new Map<string, Transaction[]>()
    for (const t of transactions) {
      if (!matches(t)) continue
      const list = byDay.get(t.date) ?? []
      list.push(t)
      byDay.set(t.date, list)
    }
    return [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [transactions, categories, accounts, query, filter, currency])

  return (
    <SubPage title="Activity" subtitle="All transactions">
      <label className="search">
        <Icon name="chart" size={16} />
        <input
          type="search"
          placeholder="Search notes, categories, amounts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search transactions"
        />
      </label>

      <div
        className="chip-row filter-row"
        role="radiogroup"
        aria-label="Filter by type"
      >
        {FILTERS.map((f) => (
          <button
            key={f.value}
            role="radio"
            aria-checked={filter === f.value}
            className={filter === f.value ? "chip active" : "chip"}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!ready ? null : groups.length === 0 ? (
        <EmptyState
          icon="receipt"
          title={
            query || filter !== "all" ? "Nothing matches" : "No activity yet"
          }
          body={
            query || filter !== "all"
              ? "Try a different search or filter."
              : "Your transactions will appear here."
          }
          action={
            !query && filter === "all" ? (
              <button
                className="primary-button small"
                onClick={() => openSheet({ kind: "transaction" })}
              >
                Add an entry
              </button>
            ) : undefined
          }
        />
      ) : (
        groups.map(([day, list]) => (
          <section className="day-group" key={day}>
            <h3>{dayLabel(day)}</h3>
            <div className="transaction-list">
              {list.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  categories={categories}
                  accounts={accounts}
                  onOpen={(t) => openSheet({ kind: "transaction", id: t.id })}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </SubPage>
  )
}
