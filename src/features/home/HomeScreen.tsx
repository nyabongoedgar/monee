import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import {
  addDays,
  differenceInCalendarDays,
  format,
  isBefore,
  startOfDay,
} from "date-fns"
import { useAppData } from "@/app/AppData"
import { totalWorth, useFinance } from "@/app/useFinance"
import { haptic, useUi } from "@/app/ui"
import { Icon } from "@/components/Icon"
import { EmptyState, Money, Ring, SectionTitle } from "@/components/common"
import { TransactionRow } from "@/components/TransactionRow"
import { markRecurringPaid } from "@/features/sheets/OtherSheets"
import { updateSettings } from "@/db/repos"
import type { Recurring, Transaction } from "@/db/types"
import { daysIn, fromDay, periodOf, shiftAnchor, toDay } from "@/lib/dates"
import { buildInsights } from "@/lib/insights"
import { budgetUsed, spendByCategory, totalsIn } from "@/lib/ledger"
import { percentChange } from "@/lib/money"
import { hasNativePrompt, isIOS, isStandalone, promptInstall } from "@/lib/pwa"

const BACKUP_REMINDER_DAYS = 7

function greeting(now: Date): string {
  const h = now.getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

export function HomeScreen() {
  const { profile, currency, hideBalances, settings } = useAppData()
  const {
    ready,
    accounts,
    transactions,
    categories,
    budgets,
    goals,
    recurring,
  } = useFinance()
  const openSheet = useUi((s) => s.openSheet)
  const toast = useUi((s) => s.toast)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [now] = useState(() => new Date())
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [installAvailable, setInstallAvailable] = useState(hasNativePrompt())

  // Home-screen shortcuts open the add sheet: /?add=expense or /?add=income
  useEffect(() => {
    const add = params.get("add")
    if (add === "expense" || add === "income") {
      openSheet({ kind: "transaction", type: add })
      setParams({}, { replace: true })
    }
  }, [params, openSheet, setParams])

  useEffect(() => {
    const onAvailable = () => setInstallAvailable(true)
    window.addEventListener("monee:install-available", onAvailable)
    return () =>
      window.removeEventListener("monee:install-available", onAvailable)
  }, [])

  const figures = useMemo(() => {
    if (!ready) return null
    const month = periodOf("month", now)
    const prevMonth = periodOf("month", shiftAnchor("month", now, -1))
    const monthTotals = totalsIn(month, transactions)
    const prevTotals = totalsIn(prevMonth, transactions)
    const worth = totalWorth(accounts, goals, transactions)
    const monthKey = toDay(now).slice(0, 7)
    const overall = budgets.find(
      (b) => b.month === monthKey && b.categoryId === null,
    )
    const daysLeft = differenceInCalendarDays(month.end, now) + 1
    const bars = daysIn({ start: addDays(now, -6), end: now }).map((day) => ({
      day,
      sum: transactions.reduce(
        (s, t) => (t.type === "expense" && t.date === day ? s + t.amount : s),
        0,
      ),
    }))
    const lastExpense = transactions.find((t) => t.type === "expense")
    const insights = buildInsights({
      currency,
      periodName: "this month",
      current: spendByCategory(month, transactions),
      previous: spendByCategory(prevMonth, transactions),
      categories,
      overallBudget: overall
        ? {
            limit: overall.limit,
            used: budgetUsed(overall, transactions),
            daysLeft,
          }
        : undefined,
      daysSinceLastExpense: lastExpense
        ? differenceInCalendarDays(now, fromDay(lastExpense.date))
        : 0,
    })
    return {
      worth,
      monthName: format(now, "MMMM"),
      monthSpent: monthTotals.expense,
      spendChange: percentChange(monthTotals.expense, prevTotals.expense),
      overall,
      overallUsed: overall ? budgetUsed(overall, transactions) : 0,
      daysLeft,
      bars,
      weekSpent: bars.reduce((s, b) => s + b.sum, 0),
      insight: insights[0],
    }
  }, [ready, now, transactions, accounts, goals, budgets, categories, currency])

  const dueSoon = useMemo(() => {
    const limit = toDay(addDays(now, 7))
    return recurring
      .filter((r) => r.active && r.nextDue <= limit)
      .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
  }, [recurring, now])

  const lastBackup = settings.lastBackupAt
    ? new Date(settings.lastBackupAt)
    : null
  const backupAgeDays = lastBackup
    ? differenceInCalendarDays(now, lastBackup)
    : null
  const needsBackup =
    transactions.length > 0 &&
    (backupAgeDays === null || backupAgeDays >= BACKUP_REMINDER_DAYS)
  const showInstall =
    !isStandalone() &&
    !settings.installPromptDismissedAt &&
    (installAvailable || isIOS())
  const activeAccounts = accounts.filter((a) => !a.archived)

  return (
    <div className="screen home-screen">
      <header className="mobile-header">
        <div
          className="profile-photo"
          style={{ background: profile.avatarColor }}
        >
          {(profile.firstName[0] ?? "") + (profile.lastName[0] ?? "")}
        </div>
        <div className="greeting">
          <span>{greeting(now)}</span>
          <h1>{profile.firstName}</h1>
        </div>
        <button
          className="round-button"
          aria-label={hideBalances ? "Show balances" : "Hide balances"}
          onClick={() => void updateSettings({ hideBalances: !hideBalances })}
        >
          <Icon name={hideBalances ? "eyeOff" : "eye"} size={18} />
        </button>
      </header>

      {showInstall && (
        <section className="notice-card">
          <div>
            <b>Install monee</b>
            <p>
              {installAvailable
                ? "Keep it on your home screen. Installed apps are protected from browser clean-up."
                : "Installed apps are protected from Safari clean-up. Use the Share button, then “Add to Home Screen”."}
            </p>
            {showIosGuide && !installAvailable && (
              <ol className="steps">
                <li>Tap the Share button in Safari.</li>
                <li>Choose “Add to Home Screen”.</li>
                <li>Open monee from your home screen.</li>
              </ol>
            )}
          </div>
          <div className="notice-actions">
            {installAvailable ? (
              <button
                className="primary-button small"
                onClick={async () => {
                  if (await promptInstall()) setInstallAvailable(false)
                }}
              >
                Install
              </button>
            ) : (
              <button
                className="primary-button small"
                onClick={() => setShowIosGuide((v) => !v)}
              >
                How?
              </button>
            )}
            <button
              className="text-button"
              onClick={() =>
                void updateSettings({
                  installPromptDismissedAt: new Date().toISOString(),
                })
              }
            >
              Not now
            </button>
          </div>
        </section>
      )}

      {needsBackup && (
        <Link to="/profile/backup" className="notice-card backup-card">
          <Icon name="download" size={18} />
          <span>
            {backupAgeDays === null
              ? "You have not backed up yet."
              : `Last backup ${backupAgeDays} days ago.`}{" "}
            Back up now
          </span>
          <Icon name="chevron" size={16} />
        </Link>
      )}

      {!figures ? (
        <div className="splash-inline" aria-busy="true" />
      ) : (
        <>
          <article className="balance-card">
            <div className="balance-top">
              <span>Total balance</span>
              <span className="balance-chip">
                {activeAccounts.length} account
                {activeAccounts.length === 1 ? "" : "s"}
              </span>
            </div>
            <strong>
              <Money minor={figures.worth.total} />
            </strong>
            <p>
              {figures.worth.inGoals > 0 && (
                <>
                  incl. <Money minor={figures.worth.inGoals} /> in savings ·{" "}
                </>
              )}
              Spent in {figures.monthName}: <Money minor={figures.monthSpent} />
              {figures.spendChange !== null && (
                <>
                  {" "}
                  ·{" "}
                  <b>
                    {figures.spendChange > 0 ? "↑" : "↓"}{" "}
                    {Math.abs(figures.spendChange)}%
                  </b>{" "}
                  vs last month
                </>
              )}
            </p>
            <div className="card-orbit one" />
            <div className="card-orbit two" />
          </article>

          <div className="quick-actions">
            <button
              onClick={() =>
                openSheet({ kind: "transaction", type: "transfer" })
              }
            >
              <span>
                <Icon name="swap" />
              </span>
              <b>Transfer</b>
            </button>
            <button
              onClick={() =>
                openSheet({ kind: "transaction", type: "expense" })
              }
            >
              <span className="featured">
                <Icon name="plus" />
              </span>
              <b>Add expense</b>
            </button>
            <button onClick={() => navigate("/wallet")}>
              <span>
                <Icon name="receipt" />
              </span>
              <b>Bills</b>
            </button>
          </div>

          <section className="budget-section">
            <SectionTitle
              title={`${figures.monthName} budget`}
              hint={`${figures.daysLeft} day${
                figures.daysLeft === 1 ? "" : "s"
              } remaining`}
              action={
                <Link to="/profile/budgets" className="link-button">
                  Budgets <Icon name="chevron" size={13} />
                </Link>
              }
            />
            {figures.overall ? (
              <BudgetCard
                used={figures.overallUsed}
                limit={figures.overall.limit}
              />
            ) : (
              <button
                className="empty-budget"
                onClick={() => openSheet({ kind: "budget", categoryId: null })}
              >
                <Icon name="plus" size={16} /> Set a monthly budget
              </button>
            )}
          </section>

          {figures.insight && (
            <article className={`insight-card tone-${figures.insight.tone}`}>
              <span className="insight-icon">
                <Icon name="sparkles" size={18} />
              </span>
              <div>
                <b>{figures.insight.title}</b>
                <p>{figures.insight.body}</p>
              </div>
            </article>
          )}

          {dueSoon.length > 0 && (
            <section className="bills-section">
              <SectionTitle
                title="Upcoming bills"
                hint="Next 7 days, plus anything overdue"
                action={
                  <Link to="/wallet" className="link-button">
                    All <Icon name="chevron" size={13} />
                  </Link>
                }
              />
              <div className="bill-list">
                {dueSoon.map((r) => (
                  <BillRow
                    key={r.id}
                    item={r}
                    now={now}
                    onPaid={async () => {
                      await markRecurringPaid(r)
                      haptic()
                      toast(`${r.name} recorded`)
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="spending-section">
            <SectionTitle title="Last 7 days" hint="Daily spending" />
            <article className="spending-card">
              <div className="spending-total">
                <div>
                  <span>Spent this week</span>
                  <strong>
                    <Money minor={figures.weekSpent} />
                  </strong>
                </div>
              </div>
              <DailyBars bars={figures.bars} />
            </article>
          </section>

          <section className="transactions-section">
            <SectionTitle
              title="Recent transactions"
              hint="Latest activity"
              action={
                <Link to="/activity" className="link-button">
                  See all <Icon name="chevron" size={13} />
                </Link>
              }
            />
            {transactions.length === 0 ? (
              <EmptyState
                icon="receipt"
                title="No transactions yet"
                body="Add an expense or income to start seeing your balance and trends."
                action={
                  <button
                    className="primary-button small"
                    onClick={() => openSheet({ kind: "transaction" })}
                  >
                    Add your first entry
                  </button>
                }
              />
            ) : (
              <div className="transaction-list">
                {transactions.slice(0, 5).map((tx: Transaction) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    categories={categories}
                    accounts={accounts}
                    onOpen={(t) => openSheet({ kind: "transaction", id: t.id })}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function BudgetCard({ used, limit }: { used: number; limit: number }) {
  const ratio = limit > 0 ? used / limit : 0
  return (
    <article className="budget-card">
      <Ring
        value={ratio}
        label={`${Math.round(ratio * 100)}%`}
        sub="used"
        tone={ratio > 1 ? "var(--coral-dark)" : "var(--coral)"}
      />
      <div className="budget-copy">
        <span>Spent this month</span>
        <strong>
          <Money minor={used} />
        </strong>
        <p>
          of <Money minor={limit} />
        </p>
      </div>
      <div className="budget-left">
        <span>
          <Money minor={Math.max(0, limit - used)} />
        </span>
        <small>{used > limit ? "over" : "left"}</small>
      </div>
    </article>
  )
}

function DailyBars({ bars }: { bars: { day: string; sum: number }[] }) {
  const max = Math.max(1, ...bars.map((b) => b.sum))
  return (
    <div
      className="mini-chart"
      role="img"
      aria-label="Daily spending for the last 7 days"
    >
      {bars.map((b, i) => (
        <span
          key={b.day}
          className={i === bars.length - 1 ? "active" : ""}
          style={
            {
              "--height": `${Math.max(4, (b.sum / max) * 100)}%`,
            } as CSSProperties
          }
        >
          <i>{format(fromDay(b.day), "EEEEE")}</i>
        </span>
      ))}
    </div>
  )
}

function BillRow({
  item,
  now,
  onPaid,
}: {
  item: Recurring
  now: Date
  onPaid: () => Promise<void>
}) {
  const due = fromDay(item.nextDue)
  const overdue = isBefore(due, startOfDay(now))
  const days = differenceInCalendarDays(due, now)
  const label = overdue
    ? `Overdue · due ${format(due, "d MMM")}`
    : days === 0
      ? "Due today"
      : `Due in ${days} day${days === 1 ? "" : "s"}`
  const isBill = item.type === "expense"
  return (
    <article className={`bill-card ${overdue ? "overdue" : ""}`}>
      <span>
        <Icon name="receipt" />
      </span>
      <div>
        <b>{item.name}</b>
        <small>{label}</small>
      </div>
      <Money minor={isBill ? -item.amount : item.amount} signed />
      <button className="small-button" onClick={() => void onPaid()}>
        {isBill ? "Mark paid" : "Received"}
      </button>
    </article>
  )
}
