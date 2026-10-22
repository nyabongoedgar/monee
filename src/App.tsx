import { useEffect } from "react"
import {
  BrowserRouter,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router"
import { useRegisterSW } from "virtual:pwa-register/react"
import { AppDataProvider } from "@/app/AppData"
import { useUi } from "@/app/ui"
import { SheetHost, ToastHost } from "@/app/Overlays"
import { Icon } from "@/components/Icon"
import { ensureMasterWrap, getSecurity, getLockAfterSec } from "@/security/pin"
import { useSession } from "@/security/session"
import { LockScreen } from "@/features/lock/LockScreen"
import { Onboarding } from "@/features/onboarding/Onboarding"
import { HomeScreen } from "@/features/home/HomeScreen"
import { ActivityScreen } from "@/features/activity/ActivityScreen"
import { StatsScreen } from "@/features/stats/StatsScreen"
import { WalletScreen } from "@/features/wallet/WalletScreen"
import { ProfileScreen } from "@/features/profile/ProfileScreen"
import {
  DetailsPage,
  SecurityPage,
  BudgetsPage,
  CategoriesPage,
} from "@/features/profile/SettingsPages"
import { BackupPage } from "@/features/backup/BackupPage"

export default function App() {
  const status = useSession((s) => s.status)

  // Registered here, not in the unlocked Shell: the browser only treats monee as
  // installable once a service worker is registered, and a new user meets the
  // onboarding and lock screens first.
  useRegisterSW({
    onNeedRefresh() {
      // Never reload silently mid-entry: the user chooses when to update.
      useUi.getState().toast("A new version of monee is ready.", {
        label: "Update",
        run: () => window.location.reload(),
      })
    },
  })

  // Boot: decide between onboarding and the lock screen.
  useEffect(() => {
    void getSecurity().then((meta) => {
      if (!meta) {
        useSession.getState().setStatus("onboarding")
        return
      }
      useSession.getState().setLockAfterSec(meta.lockAfterSec)
      useSession.getState().setStatus("locked")
    })
  }, [])

  // Keep the auto-lock timeout in sync with the stored setting after unlock.
  // Also gives installs made before the master PIN was enabled their master-PIN wrap.
  useEffect(() => {
    if (status !== "unlocked") return
    void getLockAfterSec().then((s) =>
      useSession.getState().setLockAfterSec(s),
    )
    const dek = useSession.getState().dek
    if (dek) void ensureMasterWrap(dek)
  }, [status])

  // Auto-lock when the app goes to the background, and blur the screen so the app switcher doesn't show amounts.
  useEffect(() => {
    const onVisibility = () => {
      const root = document.documentElement
      const session = useSession.getState()
      if (document.visibilityState === "hidden") {
        root.classList.add("privacy")
        session.markHidden()
        if (session.lockAfterSec === 0) session.lock()
        return
      }
      root.classList.remove("privacy")
      const hiddenAt = session.hiddenAt
      if (hiddenAt && Date.now() - hiddenAt >= session.lockAfterSec * 1000)
        session.lock()
      else useSession.setState({ hiddenAt: null })
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [])

  if (status === "loading")
    return (
      <div className="splash" aria-busy="true">
        <span className="brand-mark" />
      </div>
    )
  if (status === "onboarding") return <Onboarding />
  if (status === "locked") return <LockScreen />

  return (
    <BrowserRouter>
      <AppDataProvider>
        <Shell />
      </AppDataProvider>
    </BrowserRouter>
  )
}

function Shell() {
  const openSheet = useUi((s) => s.openSheet)
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="app">
      <div className="scroll-content" id="main">
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/activity" element={<ActivityScreen />} />
          <Route path="/stats" element={<StatsScreen />} />
          <Route path="/wallet" element={<WalletScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/profile/details" element={<DetailsPage />} />
          <Route path="/profile/security" element={<SecurityPage />} />
          <Route path="/profile/budgets" element={<BudgetsPage />} />
          <Route path="/profile/categories" element={<CategoriesPage />} />
          <Route path="/profile/backup" element={<BackupPage />} />
        </Routes>
      </div>

      <nav className="bottom-nav" aria-label="Main navigation">
        <NavLink to="/" end>
          <Icon name="home" />
          <span>Home</span>
        </NavLink>
        <NavLink to="/stats">
          <Icon name="chart" />
          <span>Stats</span>
        </NavLink>
        <NavLink to="/wallet">
          <Icon name="wallet" />
          <span>Wallet</span>
        </NavLink>
        <NavLink to="/profile">
          <Icon name="user" />
          <span>Profile</span>
        </NavLink>
      </nav>

      <button
        className="fab"
        onClick={() => openSheet({ kind: "transaction" })}
        aria-label="Add transaction"
      >
        <Icon name="plus" size={24} />
      </button>

      <SheetHost />
      <ToastHost />
    </div>
  )
}
