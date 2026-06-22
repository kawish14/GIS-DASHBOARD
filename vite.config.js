import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'gis.tes.com.pk',
      'localhost',
      '172.29.100.28'
    ],
    // If you want to continue using port 5000 in dev mode:
    port: 5000,
    host: true // This allows network access
  }
})