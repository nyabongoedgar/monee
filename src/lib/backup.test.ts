// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  parseBackup,
  PassphraseRequiredError,
  serializeBackup,
  summarizeBackup,
  toCsv,
  WrongPassphraseError,
  type BackupData,
} from "./backup"

const data: BackupData = {
  profile: null,
  accounts: [
    {
      id: "a1",
      name: "Cash",
      type: "cash",
      openingBalance: 0,
      color: "green",
      icon: "wallet",
      archived: false,
      sortOrder: 0,
    },
  ],
  categories: [
    {
      id: "c1",
      name: "Food",
      kind: "expense",
      icon: "coffee",
      color: "green",
      isDefault: true,
      archived: false,
    },
  ],
  transactions: [
    {
      id: "t1",
      type: "expense",
      amount: 4500,
      accountId: "a1",
      categoryId: "c1",
      date: "2026-10-02",
      note: 'Lunch, "special"',
      createdAt: "",
      updatedAt: "",
    },
  ],
  budgets: [],
  goals: [],
  recurring: [],
}

describe("backup files", () => {
  it("round-trips a plain backup", async () => {
    const text = await serializeBackup(data)
    const parsed = await parseBackup(text)
    expect(parsed.transactions).toHaveLength(1)
    expect(summarizeBackup(parsed)).toMatchObject({
      transactions: 1,
      accounts: 1,
      firstDate: "2026-10-02",
    })
  })

  it("round-trips an encrypted backup and rejects wrong or missing passphrases", async () => {
    const text = await serializeBackup(data, "correct horse")
    expect(text).not.toContain("Lunch")
    await expect(parseBackup(text)).rejects.toBeInstanceOf(
      PassphraseRequiredError,
    )
    await expect(parseBackup(text, "wrong passphrase")).rejects.toBeInstanceOf(
      WrongPassphraseError,
    )
    expect(
      (await parseBackup(text, "correct horse")).transactions[0].note,
    ).toBe('Lunch, "special"')
  })

  it("refuses files that are not monee backups or fail validation", async () => {
    await expect(parseBackup("not json")).rejects.toThrow(/not a monee backup/)
    await expect(
      parseBackup(JSON.stringify({ format: "other" })),
    ).rejects.toThrow(/not a monee backup/)
    const bad = JSON.parse(await serializeBackup(data))
    bad.data.transactions[0].amount = -5
    await expect(parseBackup(JSON.stringify(bad))).rejects.toThrow(/damaged/)
  })
})

describe("CSV export", () => {
  it("quotes fields containing commas and quotes", () => {
    const csv = toCsv(data, "UGX")
    expect(csv.split("\n")[0]).toBe(
      "Date,Type,Amount,Account,To account,Category,Goal,Note",
    )
    expect(csv.split("\n")[1]).toBe(
      '2026-10-02,expense,4500,Cash,,Food,,"Lunch, ""special"""',
    )
  })

  it("stops spreadsheet formulas from running when the file is opened", () => {
    const risky = {
      ...data,
      transactions: [
        { ...data.transactions[0], note: '=HYPERLINK("https://x.test")' },
      ],
    }
    const row = toCsv(risky, "UGX").split("\n")[1]
    expect(row).toContain(`'=HYPERLINK`)
  })
})
