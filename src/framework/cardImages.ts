/**
 * Card image URL resolution.
 *
 * Card catalog entries store `imagePath` as one of:
 *   1. An absolute URL: `http://…/…jpg` — use as-is.
 *   2. A root-relative path: `/player-assets/l5r-lcg/images/<id>.jpg`
 *      — serve from the current origin. This is what tcgdb's
 *      `scripts/export-deck-to-tcggg.ts` writes after copying images
 *      into `tcggg/public/player-assets/`. The Vite dev server (and
 *      the production build) serves files from `public/` at the root,
 *      so a leading-slash path resolves naturally against tcggg's
 *      own origin.
 *   3. A bare relative path: `cards/l5r-lcg/<id>.jpg` — needs a base
 *      prepended. Used by callers who want to point at a foreign host
 *      (e.g. tcgdb's Gatsby dev server at :8000) without modifying
 *      the catalog.
 *
 * Base resolution (for case 3 only), first hit wins:
 *   - `localStorage['tcggg.cardImageBase']` — user override.
 *   - `import.meta.env.VITE_CARD_IMAGE_BASE` — build-time env var.
 *   - Default '' (current origin).
 *
 * Why we *don't* prepend a base to leading-slash paths anymore: the
 * deck-export script puts images at `tcggg/public/player-assets/...`
 * which is served by tcggg's own server, not tcgdb. The old default
 * of `http://localhost:8000` produced URLs like
 *   http://localhost:8000/player-assets/l5r-lcg/images/<id>.jpg
 * which 404'd because tcgdb doesn't serve under `/player-assets/`.
 * Leading-slash paths now stay absolute relative to current origin.
 */

const LOCALSTORAGE_KEY = 'tcggg.cardImageBase'
const DEFAULT_BASE = ''   // current origin

function readEnvBase(): string | undefined {
  // import.meta.env is Vite-only — guarded so SSR / test imports
  // don't blow up.
  try {
    const env = (import.meta as { env?: Record<string, string> }).env
    const v = env?.VITE_CARD_IMAGE_BASE
    return typeof v === 'string' && v.length > 0 ? v : undefined
  } catch {
    return undefined
  }
}

function readLocalStorageBase(): string | undefined {
  try {
    const v = localStorage.getItem(LOCALSTORAGE_KEY)
    return typeof v === 'string' && v.length > 0 ? v : undefined
  } catch {
    return undefined
  }
}

/** Return the currently-configured card-image base URL for relative
 *  paths (those without a leading slash). Read order: localStorage >
 *  VITE_CARD_IMAGE_BASE > '' (current origin). Trailing slash trimmed. */
export function getCardImageBase(): string {
  const base = readLocalStorageBase() ?? readEnvBase() ?? DEFAULT_BASE
  return base.endsWith('/') ? base.slice(0, -1) : base
}

/** Resolve `imagePath` to a full URL.
 *
 *  - Absolute URLs (`http://` / `https://`) pass through.
 *  - Leading-slash paths (`/player-assets/...`) pass through as-is,
 *    relying on the browser to resolve them against the current
 *    origin. Tcgdb's export script writes paths in this form pointing
 *    at images it copied into `tcggg/public/`, so this is the normal
 *    happy path.
 *  - Bare relative paths get the configured base prepended.
 *  - Empty / undefined / non-string input returns undefined — caller
 *    hides the image. */
export function resolveCardImageUrl(
  imagePath: string | null | undefined,
): string | undefined {
  if (typeof imagePath !== 'string' || imagePath.length === 0) return undefined
  if (/^https?:\/\//i.test(imagePath)) return imagePath
  if (imagePath.startsWith('/')) return imagePath
  return getCardImageBase() + '/' + imagePath
}
