import { useEffect, useRef, useState } from "react"
import { PIN_LENGTH } from "@/security/pin"

/** Dots plus a numeric keypad. Calls onComplete once PIN_LENGTH digits are entered. */
export function PinPad({
  onComplete,
  disabled = false,
  resetKey,
  label = "Enter PIN",
  /** Changing this value clears the entered digits (e.g. after a wrong attempt). */
}: {
  onComplete: (pin: string) => void
  disabled?: boolean
  resetKey?: unknown
  label?: string
}) {
  const [pin, setPin] = useState("")
  // Refs hold the live digits, so fast or repeated key presses never read a stale value.
  const digits = useRef("")
  const latest = useRef({ onComplete, disabled })
  latest.current = { onComplete, disabled }

  const update = (next: string) => {
    digits.current = next
    setPin(next)
  }

  useEffect(() => update(""), [resetKey])

  const press = (digit: string) => {
    const { disabled: off, onComplete: done } = latest.current
    if (off || digits.current.length >= PIN_LENGTH) return
    const next = digits.current + digit
    update(next)
    if (next.length === PIN_LENGTH) {
      // Let the last dot render before the caller starts work.
      window.setTimeout(() => done(next), 80)
    }
  }

  const backspace = () => update(digits.current.slice(0, -1))

  // Keyboard support for desktop testing and external keyboards.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) press(event.key)
      else if (event.key === "Backspace") backspace()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // press/backspace only read refs, so binding once is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="pin-pad">
      <div
        className="pin-dots"
        role="img"
        aria-label={`${label}: ${pin.length} of ${PIN_LENGTH} digits entered`}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <i key={i} className={i < pin.length ? "filled" : ""} />
        ))}
      </div>
      <div className="pin-keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            disabled={disabled}
            onClick={() => press(d)}
          >
            {d}
          </button>
        ))}
        <span />
        <button type="button" disabled={disabled} onClick={() => press("0")}>
          0
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={backspace}
          aria-label="Delete digit"
        >
          ⌫
        </button>
      </div>
    </div>
  )
}
