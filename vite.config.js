import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward /api/* to the Express proxy so the browser never talks
    // directly to Anthropic and the API key stays server-side.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
