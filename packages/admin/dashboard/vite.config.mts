import inject from "@medusajs/admin-vite-plugin"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import inspect from "vite-plugin-inspect"

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())

  const BASE = env.VITE_MEDUSA_BASE || "/"
  const BACKEND_URL = env.VITE_MEDUSA_BACKEND_URL || "http://localhost:9000"
  const STOREFRONT_URL =
    env.VITE_MEDUSA_STOREFRONT_URL || "http://localhost:8000"
  const AUTH_TYPE = env.VITE_MEDUSA_AUTH_TYPE || "session"
  const JWT_TOKEN_STORAGE_KEY = env.VITE_MEDUSA_JWT_TOKEN_STORAGE_KEY || ""
  /*
   * `file-upload.tsx` reads this as a bare global while its module loads, so
   * leaving it out makes the whole app throw a ReferenceError before React
   * mounts and the dev server serves a blank page. The bundled admin defines
   * all six globals (admin-bundler/src/utils/config.ts); this one was the last
   * missing here. The default matches the bundler's.
   */
  const MAX_UPLOAD_FILE_SIZE =
    Number(env.VITE_MEDUSA_MAX_UPLOAD_FILE_SIZE) || 1024 * 1024

  /**
   * Add this to your .env file to specify the project to load admin extensions from.
   */
  const MEDUSA_PROJECT = env.VITE_MEDUSA_PROJECT || null
  const sources = MEDUSA_PROJECT ? [MEDUSA_PROJECT] : []

  return {
    plugins: [
      inspect(),
      react(),
      inject({
        sources,
      }),
    ],
    define: {
      __BASE__: JSON.stringify(BASE),
      __BACKEND_URL__: JSON.stringify(BACKEND_URL),
      __STOREFRONT_URL__: JSON.stringify(STOREFRONT_URL),
      __AUTH_TYPE__: JSON.stringify(AUTH_TYPE),
      __JWT_TOKEN_STORAGE_KEY__: JSON.stringify(JWT_TOKEN_STORAGE_KEY),
      __MAX_UPLOAD_FILE_SIZE__: JSON.stringify(MAX_UPLOAD_FILE_SIZE),
    },
    server: {
      open: true,
    },
  }
})
