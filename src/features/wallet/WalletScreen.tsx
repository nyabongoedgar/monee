import { useMemo } from "react"
import { format } from "date-fns"
import { useAppData } from "@/app/AppData"
import { totalWorth, useFinance } from "@/app/useFinance"
import { haptic, useUi } from "@/app/ui"
import {
  EmptyState,
  Money,
  ProgressBar,
  SectionTitle,
} from "@/components/common"
import { Icon } from "@/components/Icon"
import { goalSaved, accountBalances } from "@/lib/ledger"
import { fromDay } from "@/lib/dates"
import { markRecurringPaid } from "@/features/sheets/OtherSheets"

const ACCOUNT_ICON_TONE: Record<string, string> = {
  cash: "green",
  bank: "blue",
  mobile: "orange",
  savings: "sand",
  other: "gray",
}

export function WalletScreen() {
  const { currency } = useAppData()
  const { ready, accounts, transactions, goals, recurring } = useFinance()
  const openSheet = useUi((s) => s.openSheet)
  const toast = useUi((s) => s.toast)

  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.archived),
    [accounts],
  )
  const balances = useMemo(
    () => accountBalances(accounts, transactions),
    [accounts, transactions],
  )
  const worth = useMemo(
    () => totalWorth(accounts, goals, transactions),
    [accounts, goals, transactions],
  )
  const activeGoals = goals.filter((g) => !g.archived)
  const schedules = recurring
    .filter((r) => r.active)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
  const dueLimit = format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd")

  return (
    <div className="screen wallet-screen">
      <header className="screen-header">
        <div>
          <span>Accounts & goals</span>
          <h1>My wallet</h1>
        </div>
      </header>

      <article className="bank-card">
        <div className="bank-card-top">
          <span className="brand-mini">
            <i />
          </span>
          <b>monee</b>
          <span>
            {activeAccounts.length} acct{activeAccounts.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="card-balance">
          <span>Available in accounts</span>
          <strong>
            <Money minor={worth.inAccounts} />
          </strong>
        </div>
        <div className="card-number">
          <span>Savings</span>
          <b>
            <Money minor={worth.inGoals} />
          </b>
        </div>
        <div className="bank-orbit" />
      </article>

      <div className="wallet-actions">
        <button
          onClick={() => openSheet({ kind: "transaction", type: "transfer" })}
        >
          <span>
            <Icon name="swap" />
          </span>
          <b>Transfer</b>
        </button>
        <button
          onClick={() => openSheet({ kind: "transaction", type: "income" })}
        >
          <span>
            <Icon name="plus" />
          </span>
          <b>Add income</b>
        </button>
        <button onClick={() => openSheet({ kind: "goal" })}>
          <span>
            <Icon name="piggy" />
          </span>
          <b>New goal</b>
        </button>
      </div>

      <section>
        <SectionTitle
          title="Accounts"
          hint="Balances update as you record"
          action={
            <button
              className="link-button"
              onClick={() => openSheet({ kind: "account" })}
            >
              Add <Icon name="plus" size={13} />
            </button>
          }
        />
        {!ready ? null : activeAccounts.length === 0 ? (
          <EmptyState
            icon="wallet"
            title="No accounts"
            body="Add the places your money lives, such as cash, a bank or mobile money."
          />
        ) : (
          <div className="account-list">
            {activeAccounts.map((a) => (
              <button
                key={a.id}
                onClick={() => openSheet({ kind: "account", id: a.id })}
              >
                <span
                  className={`account-icon tone-${ACCOUNT_ICON_TONE[a.type] ?? "gray"}`}
                >
                  <Icon name={a.type === "savings" ? "piggy" : "wallet"} />
                </span>
                <span>
                  <b>{a.name}</b>
                  <small>{labelForType(a.type)}</small>
                </span>
                <strong>
                  <Money minor={balances.get(a.id) ?? 0} />
                </strong>
                <Icon name="chevron" size={15} />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="goals-section">
        <SectionTitle
          title="Savings goals"
          hint={
            activeGoals.length
              ? `${activeGoals.length} active`
              : "Set money aside"
          }
          action={
            <button
              className="link-button"
              onClick={() => openSheet({ kind: "goal" })}
            >
              New <Icon name="plus" size={13} />
            </button>
          }
        />
        {activeGoals.length === 0 ? (
          <EmptyState
            icon="piggy"
            title="No goals yet"
            body="Name something you're saving for and watch the progress grow."
          />
        ) : (
          <div className="goal-list">
            {activeGoals.map((g) => {
              const saved = goalSaved(g.id, transactions)
              const ratio = g.target ? saved / g.target : 0
              return (
                <article className="goal-row" key={g.id}>
                  <button
                    className="goal-title"
                    onClick={() => openSheet({ kind: "goal", id: g.id })}
                  >
                    <span className="account-icon tone-green">
                      <Icon name="piggy" />
                    </span>
                    <span>
                      <b>{g.name}</b>
                      <small>
                        {g.deadline
                          ? `By ${format(fromDay(g.deadline), "d MMM yyyy")}`
                          : "No deadline"}
                      </small>
                    </span>
                    <strong>{Math.round(ratio * 100)}%</strong>
                  </button>
                  <ProgressBar value={ratio} tone="var(--green)" />
                  <div className="goal-meta">
                    <span>
                      <Money minor={saved} /> of <Money minor={g.target} />
                    </span>
                    <span className="goal-actions">
                      <button
                        className="small-button"
                        onClick={() =>
                          openSheet({
                            kind: "goalMove",
                            goalId: g.id,
                            withdraw: false,
                          })
                        }
                      >
                        Add
                      </button>
                      {saved > 0 && (
                        <button
                          className="small-button ghost"
                          onClick={() =>
                            openSheet({
                              kind: "goalMove",
                              goalId: g.id,
                              withdraw: true,
                            })
                          }
                        >
                          Withdraw
                        </button>
                      )}
                    </span>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="bills-section">
        <SectionTitle
          title="Bills & income"
          hint="Recurring items"
          action={
            <button
              className="link-button"
              onClick={() => openSheet({ kind: "recurring" })}
            >
              Add <Icon name="plus" size={13} />
            </button>
          }
        />
        {schedules.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="Nothing recurring"
            body="Add rent, subscriptions or a salary and mark them paid when they come up."
          />
        ) : (
          <div className="bill-list">
            {schedules.map((r) => {
              const overdue = r.nextDue < format(new Date(), "yyyy-MM-dd")
              const soon = r.nextDue <= dueLimit
              return (
                <article
                  className={`bill-card ${overdue ? "overdue" : ""}`}
                  key={r.id}
                >
                  <button
                    className="bill-title"
                    onClick={() => openSheet({ kind: "recurring", id: r.id })}
                  >
                    <span>
                      <Icon name="receipt" />
                    </span>
                    <span>
                      <b>{r.name}</b>
                      <small>
                        {overdue ? "Overdue" : soon ? "Due soon" : "Scheduled"}{" "}
                        · {format(fromDay(r.nextDue), "d MMM")} · {r.frequency}
                      </small>
                    </span>
                  </button>
                  <Money
                    minor={r.type === "expense" ? -r.amount : r.amount}
                    signed
                  />
                  {soon && (
                    <button
                      className="small-button"
                      onClick={async () => {
                        await markRecurringPaid(r)
                        haptic()
                        toast(`${r.name} recorded`)
                      }}
                    >
                      {r.type === "expense" ? "Mark paid" : "Received"}
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      <p className="muted small center">
        Amounts in {currency}. Savings and transfers are not counted as
        spending.
      </p>
    </div>
  )
}

function labelForType(type: string): string {
  return (
    ({
      cash: "Cash",
      bank: "Bank",
      mobile: "Mobile money",
      savings: "Savings",
      other: "Account",
    } as Record<string, string>)[type] ?? "Account"
  )
}
