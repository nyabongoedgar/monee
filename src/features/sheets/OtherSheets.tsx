import { useEffect, useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { useAppData } from "@/app/AppData"
import { haptic, useUi } from "@/app/ui"
import { Field, FormError } from "@/components/common"
import { Icon } from "@/components/Icon"
import { Sheet } from "@/components/Sheet"
import { newId } from "@/db/seed"
import {
  deleteAccount,
  deleteBudget,
  deleteGoal,
  deleteRecurring,
  listAccounts,
  listBudgets,
  listCategories,
  listGoals,
  listRecurring,
  listTransactions,
  saveAccount,
  saveBudget,
  saveCategory,
  saveGoal,
  recordRecurringPayment,
  saveRecurring,
  saveTransaction,
} from "@/db/repos"
import type {
  Account,
  AccountType,
  Budget,
  Category,
  CategoryKind,
  Frequency,
  Goal,
  Recurring,
  Transaction,
} from "@/db/types"
import { anchorDayOf, advanceDue } from "@/lib/recurring"
import { toDay, todayDay } from "@/lib/dates"
import { goalSaved } from "@/lib/ledger"
import {
  currencyDigits,
  formatMoney,
  parseMoney,
  toInputValue,
} from "@/lib/money"

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "mobile", label: "Mobile money" },
  { value: "savings", label: "Savings" },
  { value: "other", label: "Other" },
]

export const TONES = [
  "coral",
  "green",
  "purple",
  "blue",
  "orange",
  "sand",
  "gray",
] as const
export const CATEGORY_ICONS = [
  "home",
  "coffee",
  "cart",
  "car",
  "receipt",
  "heart",
  "film",
  "bag",
  "bolt",
  "briefcase",
  "sparkles",
  "dots",
  "piggy",
  "wallet",
  "send",
] as const

/** Parses an optional amount. Blank counts as zero. Returns null when invalid. */
function parseOptional(text: string, currency: string): number | null {
  if (!text.trim()) return 0
  return parseMoney(text, currency)
}

// ---- Account --------------------------------------------------------------------

export function AccountSheet({
  id,
  onClose,
}: {
  id?: string
  onClose: () => void
}) {
  const { currency } = useAppData()
  const toast = useUi((s) => s.toast)
  const accounts = useLiveQuery(() => listAccounts(true), [])
  const transactions = useLiveQuery(() => listTransactions(), [])
  const existing = accounts?.find((a) => a.id === id)
  const [name, setName] = useState("")
  const [type, setType] = useState<AccountType>("bank")
  const [opening, setOpening] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(!id)

  useEffect(() => {
    if (!existing || ready) return
    setName(existing.name)
    setType(existing.type)
    setOpening(
      existing.openingBalance
        ? toInputValue(existing.openingBalance, currency)
        : "",
    )
    setReady(true)
  }, [existing, ready, currency])

  const used = (transactions ?? []).some(
    (t) => t.accountId === id || t.toAccountId === id,
  )

  const save = async () => {
    if (!name.trim()) return setError("Give the account a name.")
    const openingBalance = parseOptional(opening, currency)
    if (openingBalance === null)
      return setError("Opening balance must be a number.")
    await saveAccount({
      id: existing?.id ?? newId(),
      name: name.trim(),
      type,
      openingBalance,
      color: "green",
      icon: "wallet",
      archived: existing?.archived ?? false,
      sortOrder: existing?.sortOrder ?? accounts?.length ?? 0,
    } satisfies Account)
    haptic()
    toast(existing ? "Account updated" : "Account added")
    onClose()
  }

  const toggleArchive = async () => {
    if (!existing) return
    await saveAccount({ ...existing, archived: !existing.archived })
    toast(existing.archived ? "Account restored" : "Account archived")
    onClose()
  }

  return (
    <Sheet
      kicker="Account"
      title={existing ? "Edit account" : "New account"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="Name">
          <input
            autoFocus
            value={name}
            maxLength={40}
            placeholder="e.g. MTN MoMo"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Type">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Opening balance"
          hint="The balance before you started tracking here."
        >
          <div className="amount-field">
            <span>{currency}</span>
            <input
              inputMode={currencyDigits(currency) ? "decimal" : "numeric"}
              placeholder="0"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
            />
          </div>
        </Field>
        <FormError message={error} />
        <button className="primary-button wide" type="submit">
          Save account
        </button>
        {existing && (
          <>
            <button
              type="button"
              className="ghost-button wide"
              onClick={() => void toggleArchive()}
            >
              {existing.archived ? "Restore account" : "Archive account"}
            </button>
            {used ? (
              <p className="muted small">
                This account has transactions, so it can be archived but not
                deleted.
              </p>
            ) : (
              <button
                type="button"
                className="danger-button wide"
                onClick={async () => {
                  await deleteAccount(existing.id)
                  toast("Account deleted")
                  onClose()
                }}
              >
                <Icon name="trash" size={16} /> Delete account
              </button>
            )}
          </>
        )}
      </form>
    </Sheet>
  )
}

// ---- Goal ------------------------------------------------------------------------

export function GoalSheet({
  id,
  onClose,
}: {
  id?: string
  onClose: () => void
}) {
  const { currency } = useAppData()
  const toast = useUi((s) => s.toast)
  const goals = useLiveQuery(() => listGoals(true), [])
  const transactions = useLiveQuery(() => listTransactions(), [])
  const existing = goals?.find((g) => g.id === id)
  const [name, setName] = useState("")
  const [target, setTarget] = useState("")
  const [deadline, setDeadline] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(!id)

  useEffect(() => {
    if (!existing || ready) return
    setName(existing.name)
    setTarget(toInputValue(existing.target, currency))
    setDeadline(existing.deadline ?? "")
    setReady(true)
  }, [existing, ready, currency])

  const saved =
    existing && transactions ? goalSaved(existing.id, transactions) : 0

  const save = async () => {
    if (!name.trim())
      return setError('Name your goal, such as "Emergency fund".')
    const targetMinor = parseMoney(target, currency)
    if (!targetMinor) return setError("Enter a target greater than zero.")
    await saveGoal({
      id: existing?.id ?? newId(),
      name: name.trim(),
      target: targetMinor,
      icon: "piggy",
      color: "green",
      deadline: deadline || undefined,
      archived: existing?.archived ?? false,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    } satisfies Goal)
    haptic()
    toast(existing ? "Goal updated" : "Goal created")
    onClose()
  }

  return (
    <Sheet
      kicker="Savings goal"
      title={existing ? "Edit goal" : "New goal"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="Goal">
          <input
            autoFocus
            value={name}
            maxLength={40}
            placeholder="e.g. New laptop"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Target">
          <div className="amount-field">
            <span>{currency}</span>
            <input
              inputMode="decimal"
              placeholder="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
        </Field>
        <Field label="Deadline (optional)">
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </Field>
        <FormError message={error} />
        <button className="primary-button wide" type="submit">
          Save goal
        </button>
        {existing && (
          <>
            {saved === 0 ? (
              <button
                type="button"
                className="danger-button wide"
                onClick={async () => {
                  await deleteGoal(existing.id)
                  toast("Goal deleted")
                  onClose()
                }}
              >
                <Icon name="trash" size={16} /> Delete goal
              </button>
            ) : (
              <p className="muted small">
                {formatMoney(saved, currency)} is saved here. Withdraw it before
                you can delete the goal.
              </p>
            )}
          </>
        )}
      </form>
    </Sheet>
  )
}

/** Moves money from an account into a goal (deposit) or back out (withdraw). Not counted as spending. */
export function GoalMoveSheet({
  goalId,
  withdraw,
  onClose,
}: {
  goalId: string
  withdraw: boolean
  onClose: () => void
}) {
  const { currency } = useAppData()
  const toast = useUi((s) => s.toast)
  const goals = useLiveQuery(() => listGoals(true), [])
  const accounts = useLiveQuery(() => listAccounts(), [])
  const transactions = useLiveQuery(() => listTransactions(), [])
  const goal = goals?.find((g) => g.id === goalId)
  const saved = goal && transactions ? goalSaved(goal.id, transactions) : 0
  const [amount, setAmount] = useState("")
  const [accountId, setAccountId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const selectedAccount = accountId || accounts?.[0]?.id || ""

  const save = async () => {
    const minor = parseMoney(amount, currency)
    if (!minor) return setError("Enter an amount greater than zero.")
    if (withdraw && minor > saved)
      return setError(
        `You only have ${formatMoney(saved, currency)} saved here.`,
      )
    if (!selectedAccount) return setError("Choose an account.")
    const now = new Date().toISOString()
    await saveTransaction({
      id: newId(),
      type: "goal",
      amount: minor,
      accountId: selectedAccount,
      goalId,
      withdraw,
      date: todayDay(),
      createdAt: now,
      updatedAt: now,
    })
    haptic()
    toast(withdraw ? "Withdrawn to account" : "Added to goal")
    onClose()
  }

  return (
    <Sheet
      kicker={goal?.name ?? "Goal"}
      title={withdraw ? "Withdraw from goal" : "Add to goal"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <p className="muted small">
          {formatMoney(saved, currency)} saved so far
        </p>
        <Field label="Amount">
          <div className="amount-field">
            <span>{currency}</span>
            <input
              autoFocus
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </Field>
        <Field label={withdraw ? "Move to account" : "From account"}>
          <select
            value={selectedAccount}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {(accounts ?? [])
              .filter((a) => !a.archived)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </Field>
        <FormError message={error} />
        <button className="primary-button wide" type="submit">
          {withdraw ? "Withdraw" : "Add to goal"}
        </button>
      </form>
    </Sheet>
  )
}

// ---- Recurring bill or income ----------------------------------------------------

export function RecurringSheet({
  id,
  onClose,
}: {
  id?: string
  onClose: () => void
}) {
  const { currency } = useAppData()
  const toast = useUi((s) => s.toast)
  const items = useLiveQuery(() => listRecurring(), [])
  const accounts = useLiveQuery(() => listAccounts(), [])
  const categories = useLiveQuery(() => listCategories(), [])
  const existing = items?.find((r) => r.id === id)
  const [name, setName] = useState("")
  const [kind, setKind] = useState<"expense" | "income">("expense")
  const [amount, setAmount] = useState("")
  const [accountId, setAccountId] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [frequency, setFrequency] = useState<Frequency>("monthly")
  const [startDate, setStartDate] = useState(todayDay())
  const [endDate, setEndDate] = useState("")
  const [active, setActive] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(!id)

  useEffect(() => {
    if (!existing || ready) return
    setName(existing.name)
    setKind(existing.type)
    setAmount(toInputValue(existing.amount, currency))
    setAccountId(existing.accountId)
    setCategoryId(existing.categoryId ?? "")
    setFrequency(existing.frequency)
    setStartDate(existing.startDate)
    setEndDate(existing.endDate ?? "")
    setActive(existing.active)
    setReady(true)
  }, [existing, ready, currency])

  const categoryOptions = (categories ?? []).filter(
    (c) => !c.archived && c.kind === kind,
  )
  const chosenAccount = accountId || accounts?.[0]?.id || ""

  const save = async () => {
    if (!name.trim()) return setError('Name it, such as "Rent" or "Netflix".')
    const minor = parseMoney(amount, currency)
    if (!minor) return setError("Enter an amount greater than zero.")
    if (endDate && endDate < startDate)
      return setError("The end date is before the start date.")
    const startChanged = !existing || existing.startDate !== startDate
    const item: Recurring = {
      id: existing?.id ?? newId(),
      name: name.trim(),
      type: kind,
      amount: minor,
      accountId: chosenAccount,
      categoryId: categoryOptions.some((c) => c.id === categoryId)
        ? categoryId
        : undefined,
      frequency,
      anchorDay: anchorDayOf(startDate),
      startDate,
      endDate: endDate || undefined,
      nextDue: startChanged ? startDate : existing!.nextDue,
      active,
    }
    await saveRecurring(item)
    haptic()
    toast(existing ? "Recurring item updated" : "Recurring item added")
    onClose()
  }

  return (
    <Sheet
      kicker="Recurring"
      title={existing ? "Edit recurring" : "New recurring"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="segmented" role="radiogroup" aria-label="Kind">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              className={kind === k ? "active" : ""}
              onClick={() => setKind(k)}
            >
              {k === "expense" ? "Bill" : "Income"}
            </button>
          ))}
        </div>
        <Field label="Name">
          <input
            autoFocus
            value={name}
            maxLength={40}
            placeholder="e.g. Rent"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Amount">
          <div className="amount-field">
            <span>{currency}</span>
            <input
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </Field>
        <Field label="Repeats">
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </Field>
        <Field label={kind === "expense" ? "Pay from" : "Paid into"}>
          <select
            value={chosenAccount}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {(accounts ?? [])
              .filter((a) => !a.archived)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Category">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">None</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="First due date">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="Ends (optional)">
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
        {existing && (
          <label className="toggle-row">
            <span>Active</span>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
          </label>
        )}
        <FormError message={error} />
        <button className="primary-button wide" type="submit">
          Save
        </button>
        {existing && (
          <button
            type="button"
            className="danger-button wide"
            onClick={async () => {
              await deleteRecurring(existing.id)
              toast("Recurring item removed")
              onClose()
            }}
          >
            <Icon name="trash" size={16} /> Delete
          </button>
        )}
      </form>
    </Sheet>
  )
}

/** Creates the transaction for a due recurring item and moves its due date forward. Used by "Mark as paid". */
export async function markRecurringPaid(item: Recurring): Promise<void> {
  const now = new Date().toISOString()
  const payment: Transaction = {
    id: newId(),
    type: item.type,
    amount: item.amount,
    accountId: item.accountId,
    categoryId: item.categoryId,
    date: item.nextDue,
    note: item.name,
    recurringId: item.id,
    createdAt: now,
    updatedAt: now,
  }
  const next = advanceDue(item.nextDue, item.frequency, item.anchorDay)
  const stillActive = !item.endDate || next <= item.endDate
  // One transaction: the payment and the moved due date land together or not at all.
  await recordRecurringPayment(payment, {
    ...item,
    nextDue: next,
    active: stillActive && item.active,
  })
}

// ---- Budget ----------------------------------------------------------------------

export function BudgetSheet({
  categoryId,
  onClose,
}: {
  categoryId: string | null
  onClose: () => void
}) {
  const { currency } = useAppData()
  const toast = useUi((s) => s.toast)
  const budgets = useLiveQuery(() => listBudgets(), [])
  const categories = useLiveQuery(() => listCategories(), [])
  const month = toDay(new Date()).slice(0, 7)
  const existing = useMemo(
    () =>
      budgets?.find((b) => b.month === month && b.categoryId === categoryId),
    [budgets, month, categoryId],
  )
  const [limit, setLimit] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const category = categories?.find((c) => c.id === categoryId)

  useEffect(() => {
    if (ready || budgets === undefined) return
    if (existing) setLimit(toInputValue(existing.limit, currency))
    setReady(true)
  }, [budgets, existing, ready, currency])

  const save = async () => {
    const minor = parseMoney(limit, currency)
    if (!minor) return setError("Enter a budget greater than zero.")
    const next: Budget = {
      id: existing?.id ?? newId(),
      month,
      categoryId,
      limit: minor,
    }
    await saveBudget(next)
    haptic()
    toast("Budget saved")
    onClose()
  }

  return (
    <Sheet
      kicker={month}
      title={category ? `${category.name} budget` : "Monthly budget"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field
          label="Budget for this month"
          hint={
            categoryId
              ? "Spending in this category counts against it."
              : "All spending counts against it."
          }
        >
          <div className="amount-field">
            <span>{currency}</span>
            <input
              autoFocus
              inputMode="decimal"
              placeholder="0"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
        </Field>
        <FormError message={error} />
        <button className="primary-button wide" type="submit">
          Save budget
        </button>
        {existing && (
          <button
            type="button"
            className="danger-button wide"
            onClick={async () => {
              await deleteBudget(existing.id)
              toast("Budget removed")
              onClose()
            }}
          >
            <Icon name="trash" size={16} /> Remove budget
          </button>
        )}
      </form>
    </Sheet>
  )
}

// ---- Category --------------------------------------------------------------------

export function CategorySheet({
  id,
  defaultKind,
  onClose,
}: {
  id?: string
  defaultKind?: CategoryKind
  onClose: () => void
}) {
  const toast = useUi((s) => s.toast)
  const categories = useLiveQuery(() => listCategories(), [])
  const existing = categories?.find((c) => c.id === id)
  const [name, setName] = useState("")
  const [kind, setKind] = useState<CategoryKind>(defaultKind ?? "expense")
  const [icon, setIcon] = useState<string>("dots")
  const [color, setColor] = useState<string>("coral")
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(!id)

  useEffect(() => {
    if (!existing || ready) return
    setName(existing.name)
    setKind(existing.kind)
    setIcon(existing.icon)
    setColor(existing.color)
    setReady(true)
  }, [existing, ready])

  const save = async () => {
    if (!name.trim()) return setError("Give the category a name.")
    const next: Category = {
      id: existing?.id ?? newId(),
      name: name.trim(),
      kind,
      icon,
      color,
      isDefault: existing?.isDefault ?? false,
      archived: existing?.archived ?? false,
    }
    await saveCategory(next)
    haptic()
    toast(existing ? "Category updated" : "Category added")
    onClose()
  }

  return (
    <Sheet
      kicker="Category"
      title={existing ? "Edit category" : "New category"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="Name">
          <input
            autoFocus
            value={name}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="segmented" role="radiogroup" aria-label="Kind">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              className={kind === k ? "active" : ""}
              onClick={() => setKind(k)}
            >
              {k === "expense" ? "Expense" : "Income"}
            </button>
          ))}
        </div>
        <div className="field">
          <span>Icon</span>
          <div className="chip-row">
            {CATEGORY_ICONS.map((i) => (
              <button
                key={i}
                type="button"
                aria-label={i}
                aria-pressed={icon === i}
                className={
                  icon === i ? "chip active icon-only" : "chip icon-only"
                }
                onClick={() => setIcon(i)}
              >
                <Icon name={i} size={16} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Colour</span>
          <div className="chip-row">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                aria-label={t}
                aria-pressed={color === t}
                className={`swatch tone-${t} ${color === t ? "active" : ""}`}
                onClick={() => setColor(t)}
              />
            ))}
          </div>
        </div>
        <FormError message={error} />
        <button className="primary-button wide" type="submit">
          Save category
        </button>
        {existing && (
          <button
            type="button"
            className="ghost-button wide"
            onClick={async () => {
              await saveCategory({ ...existing, archived: !existing.archived })
              toast(
                existing.archived ? "Category restored" : "Category archived",
              )
              onClose()
            }}
          >
            {existing.archived ? "Restore category" : "Archive category"}
          </button>
        )}
        {existing && !existing.isDefault && (
          <p className="muted small">
            Archived categories keep their past transactions.
          </p>
        )}
      </form>
    </Sheet>
  )
}
