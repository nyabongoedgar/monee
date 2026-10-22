import { format, isToday, isYesterday } from "date-fns"
import { Money } from "./common"
import { Icon } from "./Icon"
import { fromDay } from "@/lib/dates"
import type { Account, Category, Transaction } from "@/db/types"

const TYPE_ICON: Record<Transaction["type"], { icon: string; tone: string }> = {
  expense: { icon: "bag", tone: "orange" },
  income: { icon: "briefcase", tone: "green" },
  transfer: { icon: "swap", tone: "blue" },
  goal: { icon: "piggy", tone: "sand" },
}

export function dayLabel(day: string): string {
  const date = fromDay(day)
  if (isToday(date)) return "Today"
  if (isYesterday(date)) return "Yesterday"
  return format(date, "EEE, d MMM")
}

export function TransactionRow({
  tx,
  categories,
  accounts,
  onOpen,
}: {
  tx: Transaction
  categories: Category[]
  accounts: Account[]
  onOpen: (tx: Transaction) => void
}) {
  const category = categories.find((c) => c.id === tx.categoryId)
  const account = accounts.find((a) => a.id === tx.accountId)
  const toAccount = accounts.find((a) => a.id === tx.toAccountId)
  const visual = category
    ? { icon: category.icon, tone: category.color }
    : TYPE_ICON[tx.type]

  const title =
    tx.note ||
    (tx.type === "transfer"
      ? `Transfer to ${toAccount?.name ?? "account"}`
      : undefined) ||
    (tx.type === "goal"
      ? tx.withdraw
        ? "Withdrew from goal"
        : "Saved to goal"
      : undefined) ||
    category?.name ||
    (tx.type === "income" ? "Income" : "Expense")

  const signed =
    tx.type === "expense"
      ? -tx.amount
      : tx.type === "income"
        ? tx.amount
        : tx.amount
  const showSign = tx.type === "expense" || tx.type === "income"

  return (
    <button type="button" className="transaction" onClick={() => onOpen(tx)}>
      <span className={`transaction-icon tone-${visual.tone}`}>
        <Icon name={visual.icon} />
      </span>
      <span className="transaction-copy">
        <b>{title}</b>
        <small>
          {dayLabel(tx.date)} · {account?.name ?? "Account"}
        </small>
      </span>
      <strong className={tx.type === "income" ? "positive" : undefined}>
        <Money minor={signed} signed={showSign} />
      </strong>
    </button>
  )
}
