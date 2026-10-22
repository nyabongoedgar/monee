import { useMemo, type ReactNode } from "react"
import { Link } from "react-router"
import { useAppData } from "@/app/AppData"
import { useFinance } from "@/app/useFinance"
import { Icon } from "@/components/Icon"
import { Ring } from "@/components/common"
import { periodOf, toDay } from "@/lib/dates"
import { totalsIn } from "@/lib/ledger"
import { formatMoney } from "@/lib/money"

export function ProfileScreen() {
  const { profile, currency, settings } = useAppData()
  const { transactions } = useFinance()

  const saved = useMemo(() => {
    const totals = totalsIn(
      periodOf("month", new Date(), settings.weekStart),
      transactions,
    )
    return totals.income - totals.expense
  }, [transactions, settings.weekStart])

  const target = settings.monthlySavingsTarget
  const ratio = target > 0 ? Math.max(0, saved) / target : 0
  const lastBackup = settings.lastBackupAt
    ? toDay(new Date(settings.lastBackupAt))
    : null

  return (
    <div className="screen profile-screen">
      <header className="screen-header">
        <div>
          <span>Your monee account</span>
          <h1>Profile</h1>
        </div>
      </header>

      <section className="profile-hero">
        <div
          className="profile-avatar"
          style={{ background: profile.avatarColor }}
        >
          {(profile.firstName[0] ?? "") + (profile.lastName[0] ?? "")}
          <span />
        </div>
        <h2>
          {profile.firstName} {profile.lastName}
        </h2>
        <p>{profile.email}</p>
        <Link to="/profile/details" className="outline-button">
          Edit profile
        </Link>
      </section>

      <article className="goal-card">
        <div>
          <span>Saved this month</span>
          <strong>
            {formatMoney(Math.max(0, saved), currency)}{" "}
            <small>
              {target > 0
                ? `of ${formatMoney(target, currency)}`
                : "no target set"}
            </small>
          </strong>
          {target === 0 && (
            <Link to="/profile/details" className="goal-link">
              Set a monthly savings target
            </Link>
          )}
        </div>
        {target > 0 && (
          <Ring
            value={ratio}
            size={48}
            label={`${Math.min(100, Math.round(ratio * 100))}%`}
            tone="var(--coral)"
          />
        )}
      </article>

      <Group title="Account">
        <Row
          to="/profile/details"
          tone="peach"
          icon="user"
          title="Personal details"
          sub="Name, email, currency"
        />
        <Row
          to="/profile/security"
          tone="mint"
          icon="lock"
          title="Security"
          sub="PIN, biometrics, auto-lock, reset"
        />
        <Row
          to="/profile/budgets"
          tone="violet"
          icon="chart"
          title="Budgets"
          sub="Monthly and per-category limits"
        />
        <Row
          to="/profile/categories"
          tone="sand"
          icon="sparkles"
          title="Categories"
          sub="Add, rename or archive"
        />
      </Group>

      <Group title="Data">
        <Row
          to="/profile/backup"
          tone="gray"
          icon="download"
          title="Backup & restore"
          sub={lastBackup ? `Last backup ${lastBackup}` : "Not backed up yet"}
        />
      </Group>

      <section className="privacy-card">
        <Icon name="shield" size={18} />
        <div>
          <b>Your data never leaves this device.</b>
          <p>
            No account, no servers, no bank links. Amounts and notes are
            encrypted with a key that your PIN unlocks.
          </p>
        </div>
      </section>

      <p className="muted small center">monee · v1.0</p>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Row({
  to,
  tone,
  icon,
  title,
  sub,
}: {
  to: string
  tone: string
  icon: string
  title: string
  sub: string
}) {
  return (
    <Link to={to} className="settings-row">
      <span className={`setting-icon tone-${tone}`}>
        <Icon name={icon} />
      </span>
      <span>
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      <Icon name="chevron" size={16} />
    </Link>
  )
}
