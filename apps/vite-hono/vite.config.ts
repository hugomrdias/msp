import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(() => {
  const apiPort = process.env.API_PORT ?? '3001'

  return {
    build: {
      outDir: 'dist',
    },
    plugins: [react()],
    server: {
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },
  }
})
