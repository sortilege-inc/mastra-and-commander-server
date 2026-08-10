import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Inject the package version so recorded game transcripts can stamp WHICH app /
// AI version played (training-data provenance — see replayTranscript senseiVersion).
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
