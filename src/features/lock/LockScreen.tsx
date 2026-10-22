import { useEffect, useState } from "react"
import { PinPad } from "@/components/PinPad"
import { FormError } from "@/components/common"
import { Icon } from "@/components/Icon"
import {
  getSecurity,
  isValidPin,
  MASTER_PIN_ENABLED,
  setPin,
  unlockWithMasterPin,
  unlockWithPin,
} from "@/security/pin"
import { unlockWithPasskey } from "@/security/passkey"
import { useSession } from "@/security/session"

type Mode = "pin" | "master" | "new" | "confirm"

export function LockScreen() {
  const [mode, setMode] = useState<Mode>("pin")
  const [message, setMessage] = useState<string | null>(null)
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [resetKey, setResetKey] = useState(0)
  const [hasPasskey, setHasPasskey] = useState(false)
  const [hasMaster, setHasMaster] = useState(false)
  const [recoveryDek, setRecoveryDek] = useState<CryptoKey | null>(null)
  const [newPin, setNewPin] = useState("")
  const [busy, setBusy] = useState(false)

  const unlock = (dek: CryptoKey) => useSession.getState().unlock(dek)
  const lockedFor =
    retryAt && retryAt > now ? Math.ceil((retryAt - now) / 1000) : 0

  useEffect(() => {
    void getSecurity().then((meta) => {
      setHasPasskey(Boolean(meta?.passkey))
      setHasMaster(Boolean(meta?.masterWrappedDek))
    })
  }, [])

  // Try biometrics once on launch. If it fails or is cancelled, the PIN pad is right there.
  useEffect(() => {
    if (!hasPasskey) return
    void unlockWithPasskey().then((dek) => dek && unlock(dek))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPasskey])

  useEffect(() => {
    if (!lockedFor) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [lockedFor])

  const tryBiometrics = async () => {
    const dek = await unlockWithPasskey()
    if (dek) unlock(dek)
    else setMessage("Biometric unlock was cancelled. Use your PIN.")
  }

  const onPin = async (pin: string) => {
    setBusy(true)
    setMessage(null)
    const result = await unlockWithPin(pin)
    setBusy(false)
    if (result.ok) return unlock(result.dek)
    setResetKey((k) => k + 1)
    if (result.reason === "locked-out") {
      setRetryAt(Date.now() + (result.retryInSec ?? 30) * 1000)
      setNow(Date.now())
      return setMessage("Too many wrong attempts. Wait before trying again.")
    }
    setMessage(
      `Wrong PIN. ${result.attemptsLeft} attempt${
        result.attemptsLeft === 1 ? "" : "s"
      } left before a delay.`,
    )
  }

  const onMaster = async (pin: string) => {
    setBusy(true)
    setMessage(null)
    const result = await unlockWithMasterPin(pin)
    setBusy(false)
    if (result.ok) {
      setRecoveryDek(result.dek)
      setMode("new")
      setResetKey((k) => k + 1)
      return setMessage("Master PIN accepted. Choose a new PIN.")
    }
    setResetKey((k) => k + 1)
    setMessage(
      result.reason === "locked-out"
        ? "Too many attempts. Wait before trying again."
        : "That is not the master PIN.",
    )
  }

  const onNewPin = async (pin: string) => {
    if (!isValidPin(pin)) return
    setNewPin(pin)
    setMode("confirm")
    setResetKey((k) => k + 1)
    setMessage("Enter the new PIN again.")
  }

  const onConfirm = async (pin: string) => {
    if (pin !== newPin || !recoveryDek) {
      setMode("new")
      setNewPin("")
      setResetKey((k) => k + 1)
      return setMessage("PINs don't match. Choose a new PIN.")
    }
    setBusy(true)
    await setPin(recoveryDek, pin)
    setBusy(false)
    unlock(recoveryDek)
  }

  const showMaster = MASTER_PIN_ENABLED && hasMaster

  return (
    <main className="lock-screen">
      <span className="brand-mark" aria-hidden="true">
        <i />
      </span>
      <h1>
        {mode === "pin"
          ? "monee is locked"
          : mode === "master"
            ? "Forgot PIN"
            : mode === "new"
              ? "New PIN"
              : "Confirm new PIN"}
      </h1>
      <p className="lead">
        {mode === "pin" && "Enter your PIN to see your money."}
        {mode === "master" &&
          "Test build: enter the master PIN to reset your PIN."}
        {mode === "new" && "Choose a new 4-digit PIN."}
        {mode === "confirm" && "Enter it again to confirm."}
      </p>

      {mode === "pin" && (
        <PinPad
          label="Enter PIN"
          disabled={busy || lockedFor > 0}
          resetKey={resetKey}
          onComplete={onPin}
        />
      )}
      {mode === "master" && (
        <PinPad
          label="Master PIN"
          disabled={busy}
          resetKey={resetKey}
          onComplete={onMaster}
        />
      )}
      {mode === "new" && (
        <PinPad label="New PIN" resetKey={resetKey} onComplete={onNewPin} />
      )}
      {mode === "confirm" && (
        <PinPad
          label="Confirm PIN"
          resetKey={resetKey}
          onComplete={onConfirm}
        />
      )}

      <FormError
        message={lockedFor ? `Try again in ${lockedFor}s.` : message}
      />
      {busy && (
        <p className="fine-print" role="status">
          Checking PIN…
        </p>
      )}

      <div className="lock-actions">
        {mode === "pin" && hasPasskey && (
          <button className="ghost-button" onClick={() => void tryBiometrics()}>
            <Icon name="shield" size={16} /> Use biometrics
          </button>
        )}
        {mode === "pin" && showMaster && (
          <button
            className="text-button"
            onClick={() => {
              setMode("master")
              setMessage(null)
              setResetKey((k) => k + 1)
            }}
          >
            Forgot PIN?
          </button>
        )}
        {mode !== "pin" && (
          <button
            className="text-button"
            onClick={() => {
              setMode("pin")
              setMessage(null)
              setRecoveryDek(null)
              setResetKey((k) => k + 1)
            }}
          >
            Back to PIN
          </button>
        )}
      </div>
      {mode === "pin" && !showMaster && (
        <p className="fine-print">
          Forgot your PIN? Your data can only be recovered from a backup.
        </p>
      )}
      {mode === "pin" && showMaster && (
        <p className="fine-print">
          Test build: master PIN recovery is enabled. Never ship this.
        </p>
      )}
    </main>
  )
}
