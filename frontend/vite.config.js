import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Chunks separados para librerías base: el navegador las cachea entre
        // deploys (solo se re-descarga el código de la app que cambió).
        // jspdf/exceljs/xlsx NO van aquí: se cargan on-demand vía import()
        // dinámico desde lib/export.js
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase':     ['@supabase/supabase-js'],
          'icons':        ['lucide-react'],
        },
      },
    },
  },
})
