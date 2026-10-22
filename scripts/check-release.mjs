// Fails the build if the [TEST] master PIN is enabled for a real release.
// Runs before `vite build` (see package.json "prebuild").
//
// Per PLAN.md §5.2: the master PIN may be on while testing on the Vercel production
// alias (VERCEL_ENV=production). It must be off once PRODUCTION_RELEASE=true is set.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(name) {
  const path = join(root, name)
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const idx = line.indexOf('=')
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')]
      }),
  )
}

const fileEnv = { ...loadEnvFile(".env"), ...loadEnvFile(".env.production") }
const get = (key) => process.env[key] ?? fileEnv[key]

const masterOn = get("VITE_TEST_MASTER_PIN") === "true"
const isRelease =
  get("VERCEL_ENV") === "production" && get("PRODUCTION_RELEASE") === "true"

if (masterOn && isRelease) {
  console.error(
    "\n[check-release] Refusing to build: VITE_TEST_MASTER_PIN=true in a production release.\n" +
      "The master PIN is a test backdoor. Unset it for a release build.\n",
  )
  process.exit(1)
}

console.log(
  `[check-release] ok (master PIN ${masterOn ? "ON, test build" : "off"})`,
)
