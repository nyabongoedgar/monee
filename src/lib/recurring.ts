import { addDays, addMonths, setDate, startOfMonth } from "date-fns"
import { daysInMonthOf, fromDay, toDay } from "./dates"

export type Frequency = "weekly" | "monthly" | "yearly"

/**
 * Next due date after `current`. Monthly and yearly items remember their anchor
 * day (e.g. the 31st), so a Feb 28 clamp doesn't permanently move the bill to the 28th.
 */
export function advanceDue(
  current: string,
  frequency: Frequency,
  anchorDay: number,
): string {
  const date = fromDay(current)
  if (frequency === "weekly") return toDay(addDays(date, 7))

  const months = frequency === "monthly" ? 1 : 12
  const base = startOfMonth(addMonths(date, months))
  const day = Math.min(anchorDay, daysInMonthOf(toDay(base)))
  return toDay(setDate(base, day))
}

/** Day-of-month anchor for a new schedule, taken from its start date. */
export function anchorDayOf(startDay: string): number {
  return fromDay(startDay).getDate()
}
