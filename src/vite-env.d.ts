/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  /** "true" only for test builds. Enables the [TEST] master PIN. Never set for production. */
  readonly VITE_TEST_MASTER_PIN?: string
}
