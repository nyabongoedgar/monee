import { useMemo, useState, type CSSProperties } from "react"
import { format } from "date-fns"
import { useAppData } from "@/app/AppData"
import { useFinance } from "@/app/useFinance"
import {
  EmptyState,
  Money,
  ProgressBar,
  SectionTitle,
} from "@/components/common"
import { Icon } from "@/components/Icon"
import { TransactionRow } from "@/components/TransactionRow"
import { useUi } from "@/app/ui"
import type { Transaction } from "@/db/types"
import {
  daysIn,
  fromDay,
  inPeriod,
  periodOf,
  shiftAnchor,
  toDay,
  type PeriodKind,
} from "@/lib/dates"
import { spendByCategory, totalsIn } from "@/lib/ledger"
import { percentChange } from "@/lib/money"

const KINDS: { value: PeriodKind; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
]

export function StatsScreen() {
  const { currency, settings } = useAppData()
  const { ready, transactions, categories, accounts } = useFinance()
  const openSheet = useUi((s) => s.openSheet)
  const [kind, setKind] = useState<PeriodKind>("month")
  const [offset, setOffset] = useState(0)
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const now = useMemo(() => new Date(), [])

  const anchor = shiftAnchor(kind, now, offset)
  const period = periodOf(kind, anchor, settings.weekStart)
  const prevPeriod = periodOf(
    kind,
    shiftAnchor(kind, anchor, -1),
    settings.weekStart,
  )
  const totals = totalsIn(period, transactions)
  const prev = totalsIn(prevPeriod, transactions)
  const change = percentChange(totals.expense, prev.expense)
  const compare = offset === 0 ? `last ${kind}` : `the previous ${kind}`

  const label =
    offset === 0
      ? `This ${kind}`
      : offset === -1
        ? `Last ${kind}`
        : kind === "year"
          ? format(anchor, "yyyy")
          : `${format(period.start, "d MMM")} – ${format(period.end, "d MMM")}`

  // Elapsed days for the daily average. The current period only counts days so far.
  const days = daysIn(period)
  const today = toDay(now)
  const elapsed =
    offset === 0
      ? Math.max(1, days.filter((d) => d <= today).length)
      : days.length
  const dailyAverage = totals.expense / Math.max(1, elapsed)

  const bars = useMemo(() => {
    if (kind === "year") {
      return Array.from({ length: 12 }, (_, m) => {
        const key = `${format(anchor, "yyyy")}-${String(m + 1).padStart(2, "0")}`
        const sum = transactions.reduce(
          (s, t) =>
            t.type === "expense" && t.date.startsWith(key) ? s + t.amount : s,
          0,
        )
        return { key, label: format(new Date(2000, m, 1), "MMMMM"), sum }
      })
    }
    return days.map((day) => ({
      key: day,
      label:
        kind === "week"
          ? format(fromDay(day), "EEEEE")
          : format(fromDay(day), "d"),
      sum: transactions.reduce(
        (s, t) => (t.type === "expense" && t.date === day ? s + t.amount : s),
        0,
      ),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, offset, transactions])

  const biggest = useMemo(
    () =>
      transactions
        .filter((t) => t.type === "expense" && inPeriod(t.date, period))
        .reduce<Transaction | null>(
          (best, t) => (!best || t.amount > best.amount ? t : best),
          null,
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, kind, offset],
  )

  const categoryRows = useMemo(() => {
    const map = spendByCategory(period, transactions)
    return [...map.entries()]
      .map(([id, amount]) => ({
        id,
        amount,
        category: categories.find((c) => c.id === id),
      }))
      .sort((a, b) => b.amount - a.amount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, offset, transactions, categories])

  const maxBar = Math.max(1, ...bars.map((b) => b.sum))
  const hasData = transactions.some((t) => inPeriod(t.date, period))

  return (
    <div className="screen stats-screen">
      <header className="screen-header">
        <div>
          <span>Insights & trends</span>
          <h1>Your spending</h1>
        </div>
      </header>

      <div className="period-row">
        <div className="period-tabs" role="radiogroup" aria-label="Period">
          {KINDS.map((k) => (
            <button
              key={k.value}
              role="radio"
              aria-checked={kind === k.value}
              className={kind === k.value ? "active" : ""}
              onClick={() => {
                setKind(k.value)
                setOffset(0)
                setOpenCategory(null)
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="period-step">
          <button
            aria-label={`Previous ${kind}`}
            onClick={() => setOffset((o) => o - 1)}
          >
            <Icon name="back" size={16} />
          </button>
          <button
            aria-label={`Next ${kind}`}
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
          >
            <Icon name="chevron" size={16} />
          </button>
        </div>
      </div>

      <article className="stats-hero">
        <span>Total spent · {label}</span>
        <strong>
          <Money minor={totals.expense} />
        </strong>
        <p>
          {change === null ? (
            "No spending to compare yet"
          ) : (
            <>
              <b className={change <= 0 ? "good" : "bad"}>
                {Math.abs(change)}% {change <= 0 ? "less" : "more"}
              </b>{" "}
              than {compare}
            </>
          )}
        </p>
        <div
          className={kind === "week" ? "month-chart week" : "month-chart"}
          role="img"
          aria-label={`${kind} spending bars`}
          style={{ gridTemplateColumns: `repeat(${bars.length}, 1fr)` }}
        >
          {bars.map((b, i) => (
            <span
              key={b.key}
              className={i === bars.length - 1 && offset === 0 ? "active" : ""}
              style={
                {
                  "--height": `${Math.max(b.sum ? 6 : 2, (b.sum / maxBar) * 100)}%`,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <div className="chart-labels">
          <span>{bars[0]?.label}</span>
          <span>{bars[Math.floor(bars.length / 2)]?.label}</span>
          <span>{bars[bars.length - 1]?.label}</span>
        </div>
      </article>

      {!ready ? null : !hasData ? (
        <EmptyState
          icon="chart"
          title="Nothing to show yet"
          body="Once you record spending in this period, trends and categories appear here."
          action={
            <button
              className="primary-button small"
              onClick={() => openSheet({ kind: "transaction" })}
            >
              Add an entry
            </button>
          }
        />
      ) : (
        <>
          <div className="stat-pair">
            <article>
              <span>Daily average</span>
              <strong>
                <Money minor={Math.round(dailyAverage)} />
              </strong>
              <small>
                over {elapsed} day{elapsed === 1 ? "" : "s"}
              </small>
            </article>
            <article>
              <span>Biggest expense</span>
              <strong>
                {biggest ? <Money minor={biggest.amount} /> : "—"}
              </strong>
              <small>
                {biggest
                  ? biggest.note ||
                    categories.find((c) => c.id === biggest.categoryId)?.name ||
                    "Expense"
                  : "None"}
              </small>
            </article>
          </div>

          <section className="flow-section">
            <SectionTitle title="Income vs spending" hint={`${label}`} />
            <article className="flow-card">
              <div className="flow-row">
                <span>Income</span>
                <ProgressBar
                  value={
                    totals.income /
                    Math.max(1, Math.max(totals.income, totals.expense))
                  }
                  tone="var(--green)"
                />
                <b>
                  <Money minor={totals.income} />
                </b>
              </div>
              <div className="flow-row">
                <span>Spending</span>
                <ProgressBar
                  value={
                    totals.expense /
                    Math.max(1, Math.max(totals.income, totals.expense))
                  }
                  tone="var(--coral)"
                />
                <b>
                  <Money minor={totals.expense} />
                </b>
              </div>
              <p className="muted small">
                {totals.income - totals.expense >= 0 ? "Kept " : "Overspent "}
                <Money minor={Math.abs(totals.income - totals.expense)} />{" "}
                {totals.income - totals.expense >= 0
                  ? "this period"
                  : "more than you earned"}
              </p>
            </article>
          </section>

          <section className="category-section">
            <SectionTitle title="By category" hint={`${currency} breakdown`} />
            <div className="category-list">
              {categoryRows.map((row) => {
                const pct = totals.expense ? row.amount / totals.expense : 0
                const open = openCategory === (row.id || "_")
                const rowTx = transactions.filter(
                  (t) =>
                    t.type === "expense" &&
                    (t.categoryId ?? "") === row.id &&
                    inPeriod(t.date, period),
                )
                return (
                  <div className="category-row" key={row.id || "_"}>
                    <button
                      className="category-toggle"
                      onClick={() =>
                        setOpenCategory(open ? null : row.id || "_")
                      }
                      aria-expanded={open}
                    >
                      <div>
                        <span
                          className={`category-dot tone-${row.category?.color ?? "gray"}`}
                        />
                        <b>{row.category?.name ?? "Uncategorised"}</b>
                        <strong>
                          <Money minor={row.amount} />
                        </strong>
                      </div>
                      <div className="category-track">
                        <i
                          className={`tone-${row.category?.color ?? "gray"}`}
                          style={
                            {
                              "--width": `${Math.round(pct * 100)}%`,
                            } as CSSProperties
                          }
                        />
                      </div>
                      <small>{Math.round(pct * 100)}% of spending</small>
                    </button>
                    {open && (
                      <div className="transaction-list nested">
                        {rowTx.map((tx) => (
                          <TransactionRow
                            key={tx.id}
                            tx={tx}
                            categories={categories}
                            accounts={accounts}
                            onOpen={(t) =>
                              openSheet({ kind: "transaction", id: t.id })
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
