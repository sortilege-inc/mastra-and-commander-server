# mastra-and-commander-server

The **play engine** for **Mastra & Commander** — an asymmetric alignment
duel (Operator vs. Entropy around an Eval). Built on
[boardgame.io](https://boardgame.io/) (v0.50) with React 18, TypeScript, and
Vite.

The framework layer here is ported from [tcggg](https://github.com/sortilege-inc/tcggg),
the sister multi-game play engine. This repo keeps tcggg's game-agnostic
shell (game/format selection, deck-import scaffolding, saved games, replay
transcripts) and swaps in Mastra & Commander as the game.

## Status

**Scaffold.** The framework shell runs, and the Mastra & Commander game is a
wiring proof that cycles the game's **locked round loop** (Reveal → Play →
Entropy → Response → Eval check) as boardgame.io phases. It implements **no
card mechanics yet** — the design in
[`../mastra-and-commander/cards/game-design.md`](../mastra-and-commander/cards/game-design.md)
is still mostly proposed/open, so the real Context / Eval / Entropy / pitch
economy will be modeled once it settles. A TicTacToe placeholder is kept
alongside as a known-good wiring baseline.

The **card content and printed frames** live in the sibling repo
[`../mastra-and-commander/`](../mastra-and-commander) (the Lens frame system +
Squib render pipeline + `cards/`). This repo is the play side only.

## Quick start

```sh
npm install
npm run dev        # http://localhost:3000
```

`npm run build` type-checks and produces a production bundle under `dist/`.
`npm run typecheck` runs `tsc --noEmit`. `npm test` runs Vitest.

## File layout

```
src/
  main.tsx              Vite entry — mounts <App /> into #root.
  App.tsx               Shell: game-select → (deck-import) → game.
  framework/            Game-agnostic engine shell (ported from tcggg).
    GameSelect.tsx      Pick game + format + mode (localStorage memory).
    registry.ts         Game registry — the ONE place allowed to import games/.
    types.ts            GameRegistration + DeckExport shapes.
    DeckImport.tsx      File/paste import for an exported deck JSON.
    storage.ts          localStorage helpers.
    savedGame.ts        Save / restore an in-progress game.
    replayTranscript.ts Records moves + outcome to a JSONL transcript.
    ...                 (aiDriver, card image + catalog helpers, etc.)
  games/
    mastra-and-commander/
      index.ts          Exports the GameRegistration.
      Game.ts           boardgame.io definition — round-loop phases (scaffold).
      Board.tsx         Renderer — round-loop stepper + Advance.
    tic-tac-toe/        boardgame.io hello-world; wiring baseline.
index.html              Vite HTML shell.
vite.config.ts          Vite + @vitejs/plugin-react config.
```

## Architecture: framework vs. game (required)

Framework code (`src/framework/`) is **game-agnostic** and must not import
from any specific game. Game code lives under `src/games/<game-id>/` and
registers itself via a `GameRegistration`. `src/framework/registry.ts` is the
single seam where the framework learns which games exist. See
[`CLAUDE.md`](CLAUDE.md) for the full rules.

## Carried over from tcggg (known stubs)

The ported framework still carries tcggg conventions that Mastra & Commander
hasn't specced yet — all game-agnostic and inert until this game needs them:

- **Deck import** (`DeckImport`, `validateDeckExport`, `CardCatalogContext`)
  expects a tcgdb-style `exportVersion: 1` deck JSON. The scaffold game
  declares no `applyDeckExport`, so the framework skips the import flow
  entirely and starts the game immediately.
- Internal `localStorage` keys and the deck-restore path still use tcggg /
  L5R-shaped names (`tcggg.*`, `stronghold/dynasty/conflict` zones). These
  will be renamed when Mastra & Commander defines its own decks.

## Adding multiplayer later

Runs **local (hot-seat) only** today. Networked play follows tcggg's plan:
add a `boardgame.io/server`, then swap the local client to a
`SocketIO` multiplayer client.
