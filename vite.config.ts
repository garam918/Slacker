import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'publisher-content',
      transformIndexHtml(html) {
        const content = readFileSync(new URL('./src/home-content.html', import.meta.url), 'utf8')
        return html.replace('<!-- publisher-content -->', content)
      },
    },
  ],
})
