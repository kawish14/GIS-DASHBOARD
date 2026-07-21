import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'fs'

const APP_VERSION = Date.now().toString() // computed once per build

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'write-version-file',
      apply: 'build',
      writeBundle(options) {
        writeFileSync(`${options.dir}/version.json`, JSON.stringify({ version: APP_VERSION }))
      }
    }
  ],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION)
  }
})