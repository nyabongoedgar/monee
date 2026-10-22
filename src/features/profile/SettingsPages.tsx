import { useEffect, useState } from "react"
import { useAppData } from "@/app/AppData"
import { useFinance } from "@/app/useFinance"
import { haptic, useUi } from "@/app/ui"
import {
  Field,
  FormError,
  Money,
  ProgressBar,
  SectionTitle,
  SubPage,
} from "@/components/common"
import { Icon } from "@/components/Icon"
import { db } from "@/db/schema"
import { getProfile, saveProfile, updateSettings } from "@/db/repos"
import { CURRENCIES } from "@/lib/currencies"
import { toDay } from "@/lib/dates"
import { budgetUsed } from "@/lib/ledger"
import { currencyDigits, parseMoney, toInputValue } from "@/lib/money"
import {
  biometricsAvailable,
  enrollPasskey,
  removePasskey,
  storePasskey,
} from "@/security/passkey"
import {
  changePin,
  getSecurity,
  isValidPin,
  MASTER_PIN_ENABLED,
  PIN_LENGTH,
  resetPinWithMaster,
  setLockAfterSec,
} from "@/security/pin"
import { useSession, requireDek } from "@/security/session"

// ---- Personal details & preferences ---------------------------------------------

export function DetailsPage() {
  const { profile, currency, settings } = useAppData()
  const toast = useUi((s) => s.toast)
  const [firstName, setFirstName] = useState(profile.firstName)
  const [lastName, setLastName] = useState(profile.lastName)
  const [email, setEmail] = useState(profile.email)
  const [code, setCode] = useState(profile.currency)
  const [weekStart, setWeekStart] = useState<0 | 1>(settings.weekStart)
  const [target, setTarget] = useState(
    settings.monthlySavingsTarget
      ? toInputValue(settings.monthlySavingsTarget, currency)
      : "",
  )
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!firstName.trim() || !lastName.trim())
      return setError("Enter your first and last name.")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return setError("Enter a valid email address.")
    const targetMinor = target.trim() ? parseMoney(target, code) : 0
    if (targetMinor === null)
      return setError("The savings target must be a number.")
    const existing = await getProfile()
    if (!existing) return
    await saveProfile({
      ...existing,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      currency: code,
    })
    await updateSettings({ weekStart, monthlySavingsTarget: targetMinor })
    haptic()
    toast("Details saved")
  }

  return (
    <SubPage title="Personal details" subtitle="Profile">
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="First name">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </Field>
        <Field label="Last name">
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field
          label="Currency"
          hint={`Changing currency changes how amounts are shown. It does not convert them. ${
            currencyDigits(code) === 0 ? "Whole numbers." : ""
          }`}
        >
          <select value={code} onChange={(e) => setCode(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
            {!CURRENCIES.some((c) => c.code === code) && (
              <option value={code}>{code}</option>
            )}
          </select>
        </Field>
        <Field label="Week starts on">
          <select
            value={weekStart}
            onChange={(e) => setWeekStart(Number(e.target.value) as 0 | 1)}
          >
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </Field>
        <Field
          label="Monthly savings target"
          hint="Shown on your profile. Savings = income minus spending this month."
        >
          <div className="amount-field">
            <span>{code}</span>
            <input
              inputMode="decimal"
              placeholder="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
        </Field>
        <label className="toggle-row">
          <span>Hide balances on Home</span>
          <input
            type="checkbox"
            checked={settings.hideBalances}
            onChange={(e) =>
              void updateSettings({ hideBalances: e.target.checked })
            }
          />
        </label>
        <FormError message={error} />
        <button className="primary-button wide" type="submit">
          Save details
        </button>
      </form>
    </SubPage>
  )
}

// ---- Security --------------------------------------------------------------------

const LOCK_OPTIONS = [
  { value: 0, label: "Immediately" },
  { value: 30, label: "After 30 seconds" },
  { value: 60, label: "After 1 minute" },
  { value: 300, label: "After 5 minutes" },
]

export function SecurityPage() {
  const toast = useUi((s) => s.toast)
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [pinError, setPinError] = useState<string | null>(null)
  const [bioSupported, setBioSupported] = useState(false)
  const [hasPasskey, setHasPasskey] = useState(false)
  const [bioError, setBioError] = useState<string | null>(null)
  const [lockAfter, setLockAfter] = useState(30)
  const [resetText, setResetText] = useState("")
  const [masterPin, setMasterPin] = useState("")
  const [resetNew, setResetNew] = useState("")
  const [resetConfirm, setResetConfirm] = useState("")
  const [resetError, setResetError] = useState<string | null>(null)
  const [hasMaster, setHasMaster] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void biometricsAvailable().then(setBioSupported)
    void getSecurity().then((meta) => {
      setHasPasskey(Boolean(meta?.passkey))
      setHasMaster(Boolean(meta?.masterWrappedDek))
      setLockAfter(meta?.lockAfterSec ?? 30)
    })
  }, [])

  const resetPinSubmit = async () => {
    setResetError(null)
    if (!isValidPin(masterPin))
      return setResetError(`Enter the ${PIN_LENGTH}-digit master PIN.`)
    if (!isValidPin(resetNew))
      return setResetError(`Choose a new ${PIN_LENGTH}-digit PIN.`)
    if (resetNew !== resetConfirm)
      return setResetError("The new PINs don't match.")
    setBusy(true)
    const ok = await resetPinWithMaster(masterPin, resetNew)
    setBusy(false)
    if (!ok)
      return setResetError(
        "That is not the master PIN, or too many attempts were made. Wait and try again.",
      )
    setMasterPin("")
    setResetNew("")
    setResetConfirm("")
    haptic()
    toast("PIN reset. Your data is unchanged.")
  }

  const changePinSubmit = async () => {
    setPinError(null)
    if (!isValidPin(current))
      return setPinError(`Enter your current ${PIN_LENGTH}-digit PIN.`)
    if (!isValidPin(next))
      return setPinError(`Choose a new ${PIN_LENGTH}-digit PIN.`)
    if (next !== confirm) return setPinError("The new PINs don't match.")
    if (next === current)
      return setPinError("Choose a PIN different from the current one.")
    setBusy(true)
    const ok = await changePin(current, next)
    setBusy(false)
    if (!ok) return setPinError("Your current PIN is not right.")
    setCurrent("")
    setNext("")
    setConfirm("")
    haptic()
    toast("PIN changed. Your data is unchanged.")
  }

  const toggleBiometrics = async () => {
    setBioError(null)
    setBusy(true)
    try {
      if (hasPasskey) {
        await removePasskey()
        setHasPasskey(false)
        toast("Biometric unlock turned off")
      } else {
        await storePasskey(await enrollPasskey(requireDek()))
        setHasPasskey(true)
        toast("Biometric unlock turned on")
      }
    } catch (err) {
      setBioError(
        err instanceof Error ? err.message : "Biometric setup failed.",
      )
    } finally {
      setBusy(false)
    }
  }

  const changeLock = async (seconds: number) => {
    setLockAfter(seconds)
    await setLockAfterSec(seconds)
    useSession.getState().setLockAfterSec(seconds)
  }

  const reset = async () => {
    if (resetText !== "RESET") return
    await db.delete()
    window.location.reload()
  }

  return (
    <SubPage title="Security" subtitle="Profile">
      <section className="settings-card">
        <h2>Change PIN</h2>
        <p className="muted small">
          Your data is not re-encrypted. Only the key is re-wrapped with the new
          PIN.
        </p>
        <div className="form-stack">
          <Field label="Current PIN">
            <PinInput value={current} onChange={setCurrent} />
          </Field>
          <Field label="New PIN">
            <PinInput value={next} onChange={setNext} />
          </Field>
          <Field label="Confirm new PIN">
            <PinInput value={confirm} onChange={setConfirm} />
          </Field>
          <FormError message={pinError} />
          <button
            className="primary-button wide"
            disabled={busy}
            onClick={() => void changePinSubmit()}
          >
            Change PIN
          </button>
        </div>
        {MASTER_PIN_ENABLED && (
          <p className="fine-print">
            Test build: the master PIN can also reset a forgotten PIN from the
            lock screen.
          </p>
        )}
      </section>

      {MASTER_PIN_ENABLED && hasMaster && (
        <section className="settings-card">
          <h2>Reset PIN</h2>
          <p className="muted small">
            Forgot your PIN? Enter the master PIN, then choose a new one. Your
            data is not changed.
          </p>
          <div className="form-stack">
            <Field label="Master PIN">
              <PinInput value={masterPin} onChange={setMasterPin} />
            </Field>
            <Field label="New PIN">
              <PinInput value={resetNew} onChange={setResetNew} />
            </Field>
            <Field label="Confirm new PIN">
              <PinInput value={resetConfirm} onChange={setResetConfirm} />
            </Field>
            <FormError message={resetError} />
            <button
              className="primary-button wide"
              disabled={busy}
              onClick={() => void resetPinSubmit()}
            >
              Reset PIN
            </button>
          </div>
        </section>
      )}

      <section className="settings-card">
        <h2>Biometric unlock</h2>
        {bioSupported ? (
          <>
            <p className="muted small">
              Use Face ID, Touch ID or your fingerprint instead of typing your
              PIN. Your PIN always still works.
            </p>
            <FormError message={bioError} />
            <button
              className={
                hasPasskey ? "ghost-button wide" : "primary-button wide"
              }
              disabled={busy}
              onClick={() => void toggleBiometrics()}
            >
              <Icon name="shield" size={16} />{" "}
              {hasPasskey
                ? "Turn off biometric unlock"
                : "Turn on biometric unlock"}
            </button>
          </>
        ) : (
          <p className="muted small">
            Biometric unlock isn't available in this browser or on this device.
            Your PIN still protects your data.
          </p>
        )}
      </section>

      <section className="settings-card">
        <h2>Auto-lock</h2>
        <Field label="Lock the app when it goes to the background">
          <select
            value={lockAfter}
            onChange={(e) => void changeLock(Number(e.target.value))}
          >
            {LOCK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="settings-card danger-zone">
        <h2>Reset app</h2>
        <p className="muted small">
          This permanently erases every account, transaction, goal and setting
          on this phone. Export a backup first if you want to keep anything.
        </p>
        <Field label="Type RESET to confirm">
          <input
            value={resetText}
            onChange={(e) => setResetText(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <button
          className="danger-button wide"
          disabled={resetText !== "RESET"}
          onClick={() => void reset()}
        >
          Erase everything
        </button>
      </section>
    </SubPage>
  )
}

function PinInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={PIN_LENGTH}
      value={value}
      onChange={(e) =>
        onChange(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))
      }
      aria-label="PIN"
    />
  )
}

// ---- Budgets ---------------------------------------------------------------------

export function BudgetsPage() {
  const { currency } = useAppData()
  const { ready, budgets, transactions, categories } = useFinance()
  const openSheet = useUi((s) => s.openSheet)
  const month = toDay(new Date()).slice(0, 7)
  const monthBudgets = budgets.filter((b) => b.month === month)
  const overall = monthBudgets.find((b) => b.categoryId === null)
  const expenseCategories = categories.filter(
    (c) => c.kind === "expense" && !c.archived,
  )

  return (
    <SubPage title="Budgets" subtitle="This month">
      <section className="budget-section">
        <SectionTitle title="Overall" hint="All spending counts" />
        {ready && (
          <BudgetLine
            title="Monthly budget"
            used={overall ? budgetUsed(overall, transactions) : 0}
            limit={overall?.limit}
            currency={currency}
            onOpen={() => openSheet({ kind: "budget", categoryId: null })}
          />
        )}
      </section>

      <section className="budget-section">
        <SectionTitle title="By category" hint="Optional limits per category" />
        <div className="settings-group">
          {expenseCategories.map((c) => {
            const budget = monthBudgets.find((b) => b.categoryId === c.id)
            return (
              <BudgetLine
                key={c.id}
                title={c.name}
                used={budget ? budgetUsed(budget, transactions) : 0}
                limit={budget?.limit}
                currency={currency}
                onOpen={() => openSheet({ kind: "budget", categoryId: c.id })}
              />
            )
          })}
        </div>
      </section>
    </SubPage>
  )
}

function BudgetLine({
  title,
  used,
  limit,
  currency,
  onOpen,
}: {
  title: string
  used: number
  limit?: number
  currency: string
  onOpen: () => void
}) {
  const ratio = limit ? used / limit : 0
  return (
    <button className="budget-line" onClick={onOpen}>
      <div>
        <b>{title}</b>
        {limit ? (
          <small>
            <Money minor={used} /> of <Money minor={limit} />{" "}
            {ratio > 1 ? "· over" : ""}
          </small>
        ) : (
          <small>No limit set</small>
        )}
      </div>
      {limit ? (
        <ProgressBar
          value={ratio}
          tone={ratio > 1 ? "var(--coral-dark)" : "var(--green)"}
        />
      ) : (
        <span className="muted small">{currency}</span>
      )}
    </button>
  )
}

// ---- Categories ------------------------------------------------------------------

export function CategoriesPage() {
  const { categories } = useFinance()
  const openSheet = useUi((s) => s.openSheet)
  const sorted = [...categories].sort(
    (a, b) =>
      Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name),
  )
  const groups: { title: string; kind: "expense" | "income" }[] = [
    { title: "Spending", kind: "expense" },
    { title: "Income", kind: "income" },
  ]

  return (
    <SubPage title="Categories" subtitle="Profile">
      {groups.map((g) => (
        <section className="settings-group" key={g.kind}>
          <h3>{g.title}</h3>
          {sorted
            .filter((c) => c.kind === g.kind)
            .map((c) => (
              <button
                key={c.id}
                className={`settings-row-button ${
                  c.archived ? "archived" : ""
                }`}
                onClick={() => openSheet({ kind: "category", id: c.id })}
              >
                <span className={`setting-icon tone-${c.color}`}>
                  <Icon name={c.icon} />
                </span>
                <span>
                  <b>{c.name}</b>
                  <small>
                    {c.archived
                      ? "Archived"
                      : c.isDefault
                        ? "Default"
                        : "Custom"}
                  </small>
                </span>
                <Icon name="chevron" size={16} />
              </button>
            ))}
          <button
            className="settings-row-button add"
            onClick={() => openSheet({ kind: "category", defaultKind: g.kind })}
          >
            <span className="setting-icon tone-gray">
              <Icon name="plus" />
            </span>
            <span>
              <b>Add {g.kind === "expense" ? "spending" : "income"} category</b>
            </span>
          </button>
        </section>
      ))}
    </SubPage>
  )
}
