import { createContext, useContext, useState, type ReactNode } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/db/schema"
import { getProfile, getSettings } from "@/db/repos"
import type { Profile, Settings } from "@/db/types"

interface AppData {
  profile: Profile
  settings: Settings
  currency: string
  hideBalances: boolean
}

const AppDataContext = createContext<AppData | null>(null)

/**
 * Loads the profile and settings once the app is unlocked. Children render only
 * after both exist, so screens can assume a currency and profile.
 */
export function AppDataProvider({ children }: { children: ReactNode }) {
  // null (not undefined) means "loaded, and there is no profile".
  const profile = useLiveQuery(
    () => getProfile().then((p) => p ?? null),
    [],
  )
  const settings = useLiveQuery(() => getSettings(), [])
  if (profile === null) return <SetupIncomplete />
  if (!profile || !settings) return <div className="splash" aria-busy="true" />
  return (
    <AppDataContext.Provider
      value={{
        profile,
        settings,
        currency: profile.currency,
        hideBalances: settings.hideBalances,
      }}
    >
      {children}
    </AppDataContext.Provider>
  )
}

/**
 * Shown when a PIN exists but the profile doesn't. Versions before the setup-order fix could
 * leave this state after an interrupted setup. Starting over is the only way out.
 */
function SetupIncomplete() {
  const [busy, setBusy] = useState(false)
  return (
    <main className="onboarding">
      <section className="onboard-step">
        <h1>Setup didn&apos;t finish</h1>
        <p className="lead">
          Your profile was never saved on this phone, so there is nothing to
          recover. Start setup again.
        </p>
        <button
          className="primary-button wide"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await db.delete()
            window.location.reload()
          }}
        >
          Start setup again
        </button>
      </section>
    </main>
  )
}

export function useAppData(): AppData {
  const value = useContext(AppDataContext)
  if (!value) throw new Error("useAppData must be used inside AppDataProvider")
  return value
}
