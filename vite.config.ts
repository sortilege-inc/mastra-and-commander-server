import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Inject the package version so recorded game transcripts can stamp WHICH app /
// AI version played (training-data provenance — see replayTranscript senseiVersion).
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

/**
 * Public base path.
 *
 * A GitHub Pages PROJECT site is served from `https://<org>.github.io/<repo>/`,
 * not the domain root, so the built asset URLs have to be prefixed or every
 * `/assets/...` request 404s. Set BASE_PATH to override (a custom domain or a
 * user/org page wants `/`); the deploy workflow passes the repo name.
 *
 * Card art is addressed through `import.meta.env.BASE_URL`, so it follows this
 * automatically — see CardFace.tsx.
 */
const base = process.env.BASE_PATH ?? '/'

// https://vitejs.dev/config/
export default defineConfig({
  base,
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
