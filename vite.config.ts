import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/rea': {
        target: 'https://rea-cloud-mcp-kj2f.onrender.com',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/mcp',
      },
    },
  },
})