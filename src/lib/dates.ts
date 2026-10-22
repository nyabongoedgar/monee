import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isWithinInterval,
  parse,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns"

/** Day-level dates are stored as plain `YYYY-MM-DD` strings (no time-zone drift). */
export const DAY_FORMAT = "yyyy-MM-dd"

export type PeriodKind = "week" | "month" | "year"

export interface Period {
  start: Date
  end: Date
}

export function toDay(date: Date): string {
  return format(date, DAY_FORMAT)
}

export function fromDay(day: string): Date {
  return parse(day, DAY_FORMAT, new Date())
}

export function todayDay(now = new Date()): string {
  return toDay(now)
}

export function periodOf(
  kind: PeriodKind,
  anchor: Date,
  weekStartsOn: 0 | 1 = 1,
): Period {
  switch (kind) {
    case "week":
      return {
        start: startOfWeek(anchor, { weekStartsOn }),
        end: endOfWeek(anchor, { weekStartsOn }),
      }
    case "month":
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) }
    case "year":
      return { start: startOfYear(anchor), end: endOfYear(anchor) }
  }
}

/** Moves an anchor date by whole periods (-1 = previous week/month/year). */
export function shiftAnchor(
  kind: PeriodKind,
  anchor: Date,
  steps: number,
): Date {
  switch (kind) {
    case "week":
      return addWeeks(anchor, steps)
    case "month":
      return addMonths(anchor, steps)
    case "year":
      return addYears(anchor, steps)
  }
}

export function inPeriod(day: string, period: Period): boolean {
  return isWithinInterval(fromDay(day), {
    start: period.start,
    end: period.end,
  })
}

/** Day strings covered by a period, inclusive. */
export function daysIn(period: Period): string[] {
  const days: string[] = []
  for (let d = period.start; d <= period.end; d = addDays(d, 1))
    days.push(toDay(d))
  return days
}

export function daysInMonthOf(day: string): number {
  return endOfMonth(fromDay(day)).getDate()
}
