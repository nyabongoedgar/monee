import { create } from "zustand"

/**
 * In-memory session. The data key exists here only while unlocked.
 * Nothing in this store is persisted.
 */
export type AppStatus = "loading" | "onboarding" | "locked" | "unlocked"

interface SessionState {
  status: AppStatus
  dek: CryptoKey | null
  lockAfterSec: number
  hiddenAt: number | null
  setStatus: (status: AppStatus) => void
  setLockAfterSec: (seconds: number) => void
  unlock: (dek: CryptoKey) => void
  lock: () => void
  markHidden: () => void
}

export const useSession = create<SessionState>((set, get) => ({
  status: "loading",
  dek: null,
  lockAfterSec: 30,
  hiddenAt: null,
  setStatus: (status) => set({ status }),
  setLockAfterSec: (lockAfterSec) => set({ lockAfterSec }),
  unlock: (dek) => set({ dek, status: "unlocked", hiddenAt: null }),
  lock: () => {
    if (get().status === "unlocked") set({ dek: null, status: "locked" })
  },
  markHidden: () => set({ hiddenAt: Date.now() }),
}))

/** The data key for reads and writes. Throws if the app is locked, which should not happen behind the lock gate. */
export function requireDek(): CryptoKey {
  const { dek } = useSession.getState()
  if (!dek) throw new Error("App is locked")
  return dek
}
