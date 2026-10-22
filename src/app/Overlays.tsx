import { useCallback } from "react"
import { useUi } from "./ui"
import { Sheet } from "@/components/Sheet"
import { TransactionSheet } from "@/features/sheets/TransactionSheet"
import {
  AccountSheet,
  BudgetSheet,
  CategorySheet,
  GoalMoveSheet,
  GoalSheet,
  RecurringSheet,
} from "@/features/sheets/OtherSheets"

/** Renders whichever bottom sheet the UI store asks for. */
export function SheetHost() {
  const sheet = useUi((s) => s.sheet)
  const closeSheet = useUi((s) => s.closeSheet)
  const close = useCallback(() => closeSheet(), [closeSheet])
  if (!sheet) return null

  switch (sheet.kind) {
    case "transaction":
      return <TransactionSheet request={sheet} onClose={close} />
    case "account":
      return <AccountSheet id={sheet.id} onClose={close} />
    case "goal":
      return <GoalSheet id={sheet.id} onClose={close} />
    case "goalMove":
      return (
        <GoalMoveSheet
          goalId={sheet.goalId}
          withdraw={sheet.withdraw}
          onClose={close}
        />
      )
    case "recurring":
      return <RecurringSheet id={sheet.id} onClose={close} />
    case "budget":
      return <BudgetSheet categoryId={sheet.categoryId} onClose={close} />
    case "category":
      return (
        <CategorySheet
          id={sheet.id}
          defaultKind={sheet.defaultKind}
          onClose={close}
        />
      )
    default:
      return (
        <Sheet kicker="" title="" onClose={close}>
          {null}
        </Sheet>
      )
  }
}

export function ToastHost() {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismissToast)
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <span>{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                void t.action!.run()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
