import { useEffect, useState } from "react"
import { PinPad } from "@/components/PinPad"
import { Field, FormError } from "@/components/common"
import { Icon } from "@/components/Icon"
import { clearAllData, saveProfile, updateSettings } from "@/db/repos"
import { seedDefaults } from "@/db/seed"
import { SCHEMA_VERSION } from "@/db/schema"
import {
  buildSecurity,
  isValidPin,
  PIN_LENGTH,
  saveSecurity,
} from "@/security/pin"
import {
  biometricsAvailable,
  enrollPasskey,
} from "@/security/passkey"
import type { PasskeyInfo, SecurityMeta } from "@/db/types"
import { useSession } from "@/security/session"
import { CURRENCIES } from "@/lib/currencies"

type Step = "welcome" | "details" | "currency" | "pin" | "confirm" | "biometric"

const AVATAR_COLORS = ["#f3d7bd", "#cfe6dc", "#d9d2ee", "#f9dcd3", "#f4ebd6"]
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function Onboarding() {
  const [step, setStep] = useState<Step>("welcome")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [currency, setCurrency] = useState("UGX")
  const [firstPin, setFirstPin] = useState("")
  // The data key and PIN record stay in memory until the whole setup succeeds.
  const [pending, setPending] = useState<{
    dek: CryptoKey
    meta: SecurityMeta
  } | null>(null)
  const [bioSupported, setBioSupported] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void biometricsAvailable().then(setBioSupported)
  }, [])

  const next = (to: Step) => {
    setError(null)
    setStep(to)
  }

  const detailsValid =
    firstName.trim() && lastName.trim() && EMAIL.test(email.trim())

  const createPin = async (confirmed: string) => {
    if (confirmed !== firstPin) {
      setError("PINs don't match. Let's try again.")
      setFirstPin("")
      setStep("pin")
      return
    }
    setBusy(true)
    try {
      setPending(await buildSecurity(confirmed))
      next("biometric")
    } catch {
      setError("Something went wrong creating your PIN. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  // Setup runs in a fixed order, and the PIN record is saved last. If anything fails or
  // the app closes midway, no PIN record exists, so the next launch starts setup again.
  const finish = async (enableBiometrics: boolean) => {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      let passkey: PasskeyInfo | undefined
      if (enableBiometrics) {
        try {
          passkey = await enrollPasskey(pending.dek)
        } catch (err) {
          // Biometrics are optional. Show why, and let the user skip.
          setError(
            err instanceof Error ? err.message : "Biometric setup was cancelled.",
          )
          setBusy(false)
          return
        }
      }
      // Leftovers from an earlier, interrupted setup can't be decrypted with this key.
      await clearAllData()
      // Writes need the data key, so set it before anything is stored.
      useSession.setState({ dek: pending.dek })
      await saveProfile({
        id: "me",
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        currency,
        createdAt: new Date().toISOString(),
        avatarColor:
          AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      })
      await updateSettings({ schemaVersion: SCHEMA_VERSION })
      await seedDefaults()
      await saveSecurity({ ...pending.meta, passkey })
      void navigator.storage?.persist?.()
      useSession.getState().unlock(pending.dek)
    } catch {
      useSession.setState({ dek: null })
      setError("Could not finish setup. Please try again.")
      setBusy(false)
    }
  }

  return (
    <main className="onboarding">
      <Progress step={step} />

      {step === "welcome" && (
        <section className="onboard-step">
          <span className="brand-mark" aria-hidden="true">
            <i />
          </span>
          <h1>Welcome to monee</h1>
          <p className="lead">
            Track spending, income and savings. Your money data stays on this
            phone. There is no account and no server.
          </p>
          <ul className="check-list">
            <li>
              <Icon name="lock" size={16} /> Encrypted with a key only your PIN
              can open
            </li>
            <li>
              <Icon name="shield" size={16} /> Works offline, with no bank
              connections
            </li>
            <li>
              <Icon name="download" size={16} /> Back up anytime from Profile
            </li>
          </ul>
          <button className="primary-button" onClick={() => next("details")}>
            Get started
          </button>
        </section>
      )}

      {step === "details" && (
        <form
          className="onboard-step"
          onSubmit={(e) => {
            e.preventDefault()
            if (!detailsValid)
              return setError("Please enter your name and a valid email.")
            next("currency")
          }}
        >
          <h1>Your details</h1>
          <p className="lead">
            Stored only on this device, shown on your profile. Nothing is
            verified.
          </p>
          <Field label="First name">
            <input
              autoFocus
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </Field>
          <Field label="Last name">
            <input
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <FormError message={error} />
          <div className="step-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => next("welcome")}
            >
              Back
            </button>
            <button className="primary-button" type="submit">
              Continue
            </button>
          </div>
        </form>
      )}

      {step === "currency" && (
        <section className="onboard-step">
          <h1>Your currency</h1>
          <p className="lead">
            Used for every amount. You can change it later. Shillings have no
            decimals, so amounts are whole numbers.
          </p>
          <div className="choice-list" role="radiogroup" aria-label="Currency">
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                type="button"
                role="radio"
                aria-checked={currency === c.code}
                className={currency === c.code ? "choice active" : "choice"}
                onClick={() => setCurrency(c.code)}
              >
                <b>{c.code}</b>
                <span>{c.name}</span>
              </button>
            ))}
          </div>
          <div className="step-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => next("details")}
            >
              Back
            </button>
            <button className="primary-button" onClick={() => next("pin")}>
              Continue
            </button>
          </div>
        </section>
      )}

      {step === "pin" && (
        <section className="onboard-step">
          <h1>Create your PIN</h1>
          <p className="lead">
            Choose a {PIN_LENGTH}-digit PIN. It unlocks the app and protects
            your data.
          </p>
          <PinPad
            label="Create PIN"
            resetKey={firstPin}
            onComplete={(pin) => {
              if (!isValidPin(pin)) return
              setFirstPin(pin)
              next("confirm")
            }}
          />
          <FormError message={error} />
        </section>
      )}

      {step === "confirm" && (
        <section className="onboard-step">
          <h1>Confirm your PIN</h1>
          <p className="lead">Enter the same PIN again.</p>
          <PinPad
            label="Confirm PIN"
            disabled={busy}
            resetKey={step}
            onComplete={createPin}
          />
          <FormError message={error} />
          <div className="step-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => next("pin")}
            >
              Change PIN
            </button>
          </div>
        </section>
      )}

      {step === "biometric" && (
        <section className="onboard-step">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="shield" size={28} />
          </span>
          <h1>Unlock faster?</h1>
          <p className="lead">
            {bioSupported
              ? "Use Face ID, Touch ID or your fingerprint to unlock. Your PIN always still works. Turn this on or off anytime under Profile → Security."
              : "Biometric unlock is not available in this browser, so you will use your PIN. You can check again later."}
          </p>
          <FormError message={error} />
          <div className="step-actions stacked">
            {bioSupported && (
              <button
                className="primary-button"
                disabled={busy || !pending}
                onClick={() => void finish(true)}
              >
                {busy ? "Setting up…" : "Enable biometrics"}
              </button>
            )}
            <button
              className="ghost-button"
              disabled={busy || !pending}
              onClick={() => void finish(false)}
            >
              Skip for now
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

function Progress({ step }: { step: Step }) {
  const order: Step[] = [
    "welcome",
    "details",
    "currency",
    "pin",
    "confirm",
    "biometric",
  ]
  const index = order.indexOf(step)
  return (
    <div className="onboard-progress" aria-hidden="true">
      {order.map((s, i) => (
        <i key={s} className={i <= index ? "on" : ""} />
      ))}
    </div>
  )
}
