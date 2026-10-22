import { useEffect, useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { useAppData } from "@/app/AppData"
import { useUi, haptic, type SheetRequest } from "@/app/ui"
import { FormError, Field } from "@/components/common"
import { Icon } from "@/components/Icon"
import { Sheet } from "@/components/Sheet"
import { newId } from "@/db/seed"
import {
  deleteTransaction,
  getTransaction,
  listAccounts,
  listCategories,
  saveTransaction,
} from "@/db/repos"
import type { Transaction } from "@/db/types"
import { todayDay } from "@/lib/dates"
import { currencyDigits, parseMoney, toInputValue } from "@/lib/money"

type Kind = "expense" | "income" | "transfer"
type TxRequest = Extract<NonNullable<SheetRequest>, { kind: "transaction" }>

export function TransactionSheet({
  request,
  onClose,
}: {
  request: TxRequest
  onClose: () => void
}) {
  const { currency } = useAppData()
  const toast = useUi((s) => s.toast)
  const accounts = useLiveQuery(() => listAccounts(), [])
  const categories = useLiveQuery(() => listCategories(), [])

  const [existing, setExisting] = useState<Transaction | null>(null)
  const [loaded, setLoaded] = useState(!request.id)
  const [type, setType] = useState<Kind>(
    request.type === "income" || request.type === "transfer"
      ? request.type
      : "expense",
  )
  const [amount, setAmount] = useState("")
  const [accountId, setAccountId] = useState(request.accountId ?? "")
  const [toAccountId, setToAccountId] = useState("")
  const [categoryId, setCategoryId] = useState(request.categoryId ?? "")
  const [date, setDate] = useState(todayDay())
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!request.id) return
    void getTransaction(request.id).then((tx) => {
      if (!tx) return
      if (tx.type === "goal") {
        // Goal moves are edited from the goal itself, so this form can't rewrite them as spending.
        toast("Goal savings are changed from the goal in Wallet.")
        onClose()
        return
      }
      setExisting(tx)
      setType(
        tx.type === "income" || tx.type === "transfer" ? tx.type : "expense",
      )
      setAmount(toInputValue(tx.amount, currency))
      setAccountId(tx.accountId)
      setToAccountId(tx.toAccountId ?? "")
      setCategoryId(tx.categoryId ?? "")
      setDate(tx.date)
      setNote(tx.note ?? "")
      setLoaded(true)
    })
  }, [request.id, currency])

  const activeAccounts = useMemo(
    () => (accounts ?? []).filter((a) => !a.archived),
    [accounts],
  )
  const categoryOptions = useMemo(
    () =>
      (categories ?? []).filter(
        (c) =>
          !c.archived && c.kind === (type === "income" ? "income" : "expense"),
      ),
    [categories, type],
  )

  const selectedAccount = accountId || activeAccounts[0]?.id || ""
  const selectedCategory = categoryOptions.some((c) => c.id === categoryId)
    ? categoryId
    : ""
  const decimals = currencyDigits(currency) > 0

  const save = async () => {
    setError(null)
    const minor = parseMoney(amount, currency)
    if (!minor)
      return setError(
        decimals
          ? "Enter an amount greater than zero, such as 12.50."
          : "Enter an amount greater than zero.",
      )
    if (!selectedAccount) return setError("Add an account first.")
    if (
      type === "transfer" &&
      (!toAccountId || toAccountId === selectedAccount)
    ) {
      return setError("Choose a different account to move money to.")
    }
    setSaving(true)
    const now = new Date().toISOString()
    const tx: Transaction = {
      ...(existing ?? {}),
      id: existing?.id ?? newId(),
      type,
      amount: minor,
      accountId: selectedAccount,
      toAccountId: type === "transfer" ? toAccountId : undefined,
      categoryId:
        type === "transfer" ? undefined : selectedCategory || undefined,
      date,
      note: note.trim() || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } as Transaction
    await saveTransaction(tx)
    haptic()
    toast(existing ? "Transaction updated" : "Transaction saved")
    onClose()
  }

  const remove = async () => {
    if (!existing) return
    const snapshot = existing
    await deleteTransaction(existing.id)
    toast("Transaction deleted", {
      label: "Undo",
      run: () => saveTransaction(snapshot),
    })
    onClose()
  }

  const accountName = (id: string) =>
    activeAccounts.find((a) => a.id === id)?.name ?? "Account"

  return (
    <Sheet
      kicker={existing ? "Edit" : "New entry"}
      title={existing ? "Edit transaction" : "Add transaction"}
      onClose={onClose}
    >
      {!loaded ? (
        <p className="muted">Loading…</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="segmented" role="radiogroup" aria-label="Type">
            {(["expense", "income", "transfer"] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={type === k}
                className={type === k ? "active" : ""}
                onClick={() => setType(k)}
              >
                {k === "expense"
                  ? "Expense"
                  : k === "income"
                    ? "Income"
                    : "Transfer"}
              </button>
            ))}
          </div>

          <Field label="Amount">
            <div className="amount-field">
              <span>{currency}</span>
              <input
                autoFocus={!existing}
                inputMode={decimals ? "decimal" : "numeric"}
                placeholder={decimals ? "0.00" : "0"}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </Field>

          {type !== "transfer" && (
            <div className="field">
              <span>Category</span>
              <div className="chip-row">
                {categoryOptions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={
                      selectedCategory === c.id ? "chip active" : "chip"
                    }
                    onClick={() => setCategoryId(c.id)}
                  >
                    <Icon name={c.icon} size={14} /> {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Field label={type === "transfer" ? "From account" : "Account"}>
            <select
              value={selectedAccount}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>

          {type === "transfer" && (
            <Field label="To account">
              <select
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
              >
                <option value="">Choose…</option>
                {activeAccounts
                  .filter((a) => a.id !== selectedAccount)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}

          <Field label="Date">
            <input
              type="date"
              value={date}
              max="9999-12-31"
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          <Field label="Note (optional)">
            <input
              placeholder="What was it for?"
              value={note}
              maxLength={120}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <FormError message={error} />
          {type === "transfer" && toAccountId && (
            <p className="muted small">
              Moves {accountName(selectedAccount)} → {accountName(toAccountId)}.
              Not counted as spending.
            </p>
          )}

          <button
            className="primary-button wide"
            type="submit"
            disabled={saving}
          >
            {saving
              ? "Saving…"
              : existing
                ? "Save changes"
                : "Save transaction"}{" "}
            <Icon name="arrow" size={18} />
          </button>
          {existing && (
            <button
              type="button"
              className="danger-button wide"
              onClick={() => void remove()}
            >
              <Icon name="trash" size={16} /> Delete
            </button>
          )}
        </form>
      )}
    </Sheet>
  )
}
