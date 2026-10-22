import { describe, expect, it } from "vitest"
import {
  currencyDigits,
  formatMoney,
  parseMoney,
  percentChange,
  toInputValue,
} from "./money"

describe("currency digits", () => {
  it("uses 0 decimals for UGX and 2 for USD", () => {
    expect(currencyDigits("UGX")).toBe(0)
    expect(currencyDigits("USD")).toBe(2)
  })
})

describe("parseMoney", () => {
  it("parses whole shillings and rejects decimals", () => {
    expect(parseMoney("1,250", "UGX")).toBe(1250)
    expect(parseMoney("12.5", "UGX")).toBeNull()
  })

  it("converts decimal currencies to minor units without float drift", () => {
    expect(parseMoney("0.1", "USD")).toBe(10)
    expect(parseMoney("19.99", "USD")).toBe(1999)
    expect(parseMoney("1 234.50", "USD")).toBe(123450)
  })

  it("reads a decimal comma as a decimal point for decimal currencies", () => {
    expect(parseMoney("12,50", "USD")).toBe(1250)
    expect(parseMoney("0,5", "USD")).toBe(50)
    expect(parseMoney("1,250.50", "USD")).toBe(125050)
    expect(parseMoney("1,250", "USD")).toBe(125000)
  })

  it("rejects an ambiguous decimal comma for whole-number currencies", () => {
    expect(parseMoney("12,50", "UGX")).toBeNull()
    expect(parseMoney("1,250", "UGX")).toBe(1250)
  })

  it("rejects zero, blanks, negatives and garbage", () => {
    expect(parseMoney("0", "USD")).toBeNull()
    expect(parseMoney("", "USD")).toBeNull()
    expect(parseMoney("-5", "USD")).toBeNull()
    expect(parseMoney("abc", "USD")).toBeNull()
    expect(parseMoney("1.234", "USD")).toBeNull()
  })
})

describe("formatMoney and toInputValue", () => {
  it("formats with the currency digits", () => {
    expect(formatMoney(1250, "UGX", { locale: "en-US" })).toContain("1,250")
    expect(formatMoney(1999, "USD", { locale: "en-US" })).toContain("19.99")
  })

  it("round-trips through toInputValue", () => {
    expect(toInputValue(1999, "USD")).toBe("19.99")
    expect(toInputValue(1250, "UGX")).toBe("1250")
  })
})

describe("percentChange", () => {
  it("returns null without a baseline", () => {
    expect(percentChange(100, 0)).toBeNull()
  })
  it("reports rises and falls", () => {
    expect(percentChange(88, 100)).toBe(-12)
    expect(percentChange(150, 100)).toBe(50)
  })
})
