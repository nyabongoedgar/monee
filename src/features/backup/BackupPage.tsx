import { useEffect, useState } from "react"
import { useAppData } from "@/app/AppData"
import { haptic, useUi } from "@/app/ui"
import { Field, FormError, SectionTitle, SubPage } from "@/components/common"
import { Icon } from "@/components/Icon"
import { updateSettings } from "@/db/repos"
import {
  BACKUP_FILE_EXTENSION,
  collectBackup,
  parseBackup,
  PassphraseRequiredError,
  restoreBackup,
  serializeBackup,
  summarizeBackup,
  toCsv,
  WrongPassphraseError,
  type BackupData,
} from "@/lib/backup"
import { datedFileName, shareOrDownload } from "@/lib/files"

const MIN_PASSPHRASE = 6

export function BackupPage() {
  const { currency, settings } = useAppData()
  const toast = useUi((s) => s.toast)
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(
    null,
  )
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [exportPass, setExportPass] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [importText, setImportText] = useState<string | null>(null)
  const [importPass, setImportPass] = useState("")
  const [needsPass, setNeedsPass] = useState(false)
  const [preview, setPreview] = useState<BackupData | null>(null)

  useEffect(() => {
    void navigator.storage
      ?.estimate?.()
      .then((e) => setStorage({ used: e.usage ?? 0, quota: e.quota ?? 0 }))
    void navigator.storage?.persisted?.().then(setPersisted)
  }, [])

  const exportBackup = async () => {
    setError(null)
    if (exportPass && exportPass.length < MIN_PASSPHRASE)
      return setError(
        `Use at least ${MIN_PASSPHRASE} characters for the passphrase, or leave it empty.`,
      )
    setBusy(true)
    try {
      const data = await collectBackup()
      const text = await serializeBackup(data, exportPass || undefined)
      const file = new File(
        [text],
        datedFileName("monee-backup", BACKUP_FILE_EXTENSION),
        { type: "application/json" },
      )
      const result = await shareOrDownload(file, "monee backup")
      if (result !== "cancelled") {
        await updateSettings({ lastBackupAt: new Date().toISOString() })
        haptic()
        toast(
          result === "shared" ? "Backup ready to save" : "Backup downloaded",
        )
      }
    } catch {
      setError("Could not create the backup. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = async () => {
    setBusy(true)
    try {
      const data = await collectBackup()
      const file = new File(
        [toCsv(data, currency)],
        datedFileName("monee-transactions", "csv"),
        { type: "text/csv" },
      )
      await shareOrDownload(file, "monee transactions")
    } finally {
      setBusy(false)
    }
  }

  const chooseFile = async (file: File | undefined) => {
    setError(null)
    setPreview(null)
    setNeedsPass(false)
    if (!file) return
    const text = await file.text()
    setImportText(text)
    await tryParse(text, undefined)
  }

  const tryParse = async (text: string, passphrase: string | undefined) => {
    try {
      setPreview(await parseBackup(text, passphrase))
      setNeedsPass(false)
    } catch (err) {
      if (err instanceof PassphraseRequiredError) return setNeedsPass(true)
      if (err instanceof WrongPassphraseError) return setError(err.message)
      setError(
        err instanceof Error ? err.message : "That file could not be read.",
      )
    }
  }

  const restore = async (mode: "replace" | "merge") => {
    if (!preview) return
    setBusy(true)
    try {
      await restoreBackup(preview, mode)
      haptic()
      toast(mode === "replace" ? "Backup restored" : "Backup merged")
      setPreview(null)
      setImportText(null)
    } catch {
      setError("Restore failed. Nothing else was changed.")
    } finally {
      setBusy(false)
    }
  }

  const summary = preview ? summarizeBackup(preview) : null
  const lastBackup = settings.lastBackupAt
    ? new Date(settings.lastBackupAt).toLocaleDateString()
    : null

  return (
    <SubPage title="Backup & restore" subtitle="Data">
      <section className="settings-card">
        <SectionTitle title="Last backup" hint={lastBackup ?? "Never"} />
        <p className="muted small">
          Back up regularly. Your data lives only on this phone, so a backup is
          the only way to recover it if you lose the phone or reset the app.
        </p>
        {storage && storage.quota > 0 && (
          <p className="muted small">
            Storage used: {(storage.used / 1e6).toFixed(1)} MB of{" "}
            {Math.round(storage.quota / 1e6)} MB
          </p>
        )}
        {persisted === false && (
          <p className="warning small">
            This browser may clear monee's data under storage pressure. Install
            monee to the home screen and back up often.
          </p>
        )}
      </section>

      <section className="settings-card">
        <h2>Export</h2>
        <Field
          label="Passphrase (optional)"
          hint="Encrypts the backup file. You will need it to restore. Leave empty for a plain file."
        >
          <input
            type="password"
            autoComplete="new-password"
            value={exportPass}
            onChange={(e) => setExportPass(e.target.value)}
          />
        </Field>
        <FormError message={error} />
        <button
          className="primary-button wide"
          disabled={busy}
          onClick={() => void exportBackup()}
        >
          <Icon name="upload" size={16} /> Export backup
        </button>
        <button
          className="ghost-button wide"
          disabled={busy}
          onClick={() => void exportCsv()}
        >
          <Icon name="download" size={16} /> Export transactions as CSV
        </button>
        <p className="fine-print">
          Your phone's share sheet lets you save the file to Files, Google Drive
          or WhatsApp.
        </p>
      </section>

      <section className="settings-card">
        <h2>Restore</h2>
        <Field label="Choose a monee backup file">
          <input
            type="file"
            accept=".monee,.json,application/json"
            onChange={(e) => void chooseFile(e.target.files?.[0])}
          />
        </Field>

        {needsPass && importText && (
          <div className="form-stack">
            <Field label="Backup passphrase">
              <input
                type="password"
                autoComplete="off"
                value={importPass}
                onChange={(e) => setImportPass(e.target.value)}
              />
            </Field>
            <button
              className="ghost-button wide"
              onClick={() => void tryParse(importText, importPass)}
            >
              Unlock backup
            </button>
          </div>
        )}

        {summary && (
          <div className="preview">
            <b>This backup contains</b>
            <ul>
              <li>
                {summary.transactions} transactions
                {summary.firstDate &&
                  ` (${summary.firstDate} → ${summary.lastDate})`}
              </li>
              <li>
                {summary.accounts} accounts · {summary.categories} categories
              </li>
              <li>
                {summary.goals} goals · {summary.budgets} budgets ·{" "}
                {summary.recurring} recurring items
              </li>
            </ul>
            <p className="muted small">
              Merge adds and updates matching items and keeps everything else.
              Replace removes all current financial data first.
            </p>
            <FormError message={error} />
            <button
              className="primary-button wide"
              disabled={busy}
              onClick={() => void restore("merge")}
            >
              Merge into this phone
            </button>
            <button
              className="danger-button wide"
              disabled={busy}
              onClick={() => void restore("replace")}
            >
              Replace everything on this phone
            </button>
          </div>
        )}
        {!summary && error && <FormError message={error} />}
      </section>
    </SubPage>
  )
}
