import type { ReactNode } from "react"
import { useNavigate } from "react-router"
import { useAppData } from "@/app/AppData"
import { formatMoney } from "@/lib/money"
import { Icon } from "./Icon"

/** Money amount that respects the "hide balances" setting. */
export function Money({
  minor,
  signed = false,
  className,
}: {
  minor: number
  signed?: boolean
  className?: string
}) {
  const { currency, hideBalances } = useAppData()
  return (
    <span className={className}>
      {hideBalances ? "•••••" : formatMoney(minor, currency, { signed })}
    </span>
  )
}

export function SubPage({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="screen">
      <header className="sub-header">
        <button
          className="round-button"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <Icon name="back" size={18} />
        </button>
        <div>
          {subtitle && <span className="eyebrow">{subtitle}</span>}
          <h1>{title}</h1>
        </div>
      </header>
      {children}
    </div>
  )
}

export function SectionTitle({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <strong>{title}</strong>
      <p>{body}</p>
      {action}
    </div>
  )
}

/** Circular progress. `value` is 0–1 and is clamped. */
export function Ring({
  value,
  size = 66,
  label,
  sub,
  tone = "var(--coral)",
}: {
  value: number
  size?: number
  label: string
  sub?: string
  tone?: string
}) {
  const pct = Math.max(0, Math.min(1, value))
  return (
    <div
      className="ring"
      role="img"
      aria-label={`${label}${sub ? `, ${sub}` : ""}`}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${tone} 0 ${pct * 100}%, #eeeae3 0)`,
      }}
    >
      <div
        className="ring-inner"
        style={{ width: size - 17, height: size - 17 }}
      >
        <strong>{label}</strong>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  )
}

export function ProgressBar({
  value,
  tone = "var(--coral)",
}: {
  value: number
  tone?: string
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <i style={{ width: `${pct}%`, background: tone }} />
    </div>
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  )
}
