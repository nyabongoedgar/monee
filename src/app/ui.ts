import { create } from "zustand"
import type { TxType } from "@/db/types"

export type SheetRequest = {
  kind: "transaction"
  id?: string
  type?: TxType
  accountId?: string
  categoryId?: string
} | { kind: "account"; id?: string } | { kind: "goal"; id?: string } | {
  kind: "goalMove"
  goalId: string
  withdraw: boolean
} | { kind: "recurring"; id?: string } | {
  kind: "budget"
  categoryId: string | null
} | { kind: "category"; id?: string; defaultKind?: "expense" | "income" } | null

export interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void | Promise<void> }
}

interface UiState {
  sheet: SheetRequest
  toasts: Toast[]
  openSheet: (sheet: Exclude<SheetRequest, null>) => void
  closeSheet: () => void
  toast: (message: string, action?: Toast["action"]) => void
  dismissToast: (id: number) => void
}

let nextToastId = 1

export const useUi = create<UiState>((set) => ({
  sheet: null,
  toasts: [],
  openSheet: (sheet) => set({ sheet }),
  closeSheet: () => set({ sheet: null }),
  toast: (message, action) => {
    const id = nextToastId++
    set((state) => ({ toasts: [...state.toasts, { id, message, action }] }))
    window.setTimeout(
      () =>
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
      action ? 6000 : 3000,
    )
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

/** Light haptic feedback where the platform supports it. */
export function haptic(ms = 12): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported */
  }
}
