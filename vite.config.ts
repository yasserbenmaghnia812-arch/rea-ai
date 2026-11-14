import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const mcpProxy = (target: string) => ({
  target,
  changeOrigin: true,
  secure: true,
  rewrite: () => '/mcp',
})

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/rea': mcpProxy('https://rea-cloud-mcp-kj2f.onrender.com'),
      '/api/replica': mcpProxy('https://replica-mcp-server-dfj0.onrender.com'),
      '/api/ecc': mcpProxy('https://yasser-ecc-mcp-m8ia.onrender.com'),
    },
  },
})
