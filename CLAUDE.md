# mastra-and-commander-server — project rules

## What this project is

- The **play engine** for **Mastra & Commander**, built on
  [boardgame.io](https://boardgame.io/) v0.50 + React 18 + TypeScript + Vite.
- The framework layer is **ported from [tcggg](https://github.com/sortilege-inc/tcggg)**
  (the sister multi-game play engine). It is multi-game by design: framework
  code is game-agnostic; each game lives in its own subdirectory.
- Current state: the round loop runs end to end on the owner's **first playable
  15-card set** (2026-08-13). The **Context is a tree of Agent-owned rows** — a
  row belongs to an Agent token, the round's first Agent is free via Mastra, and
  each further Agent opens a child row. *Process is retired.* A TicTacToe
  placeholder remains as a wiring baseline.
- Card payloads the engine cannot act on yet carry an `unimplemented` flag and
  are surfaced on the board. **Never silently omit or fake a printed mechanic** —
  a half-built card must not pass for a working one.

The **card content, rules design, and printed frames** live in the sibling
repo `../mastra-and-commander/` (Lens frame + Squib pipeline + `cards/`). This
repo does NOT own card data or frame art — do not duplicate that work here.

## The rules source of truth

`../mastra-and-commander/cards/game-design.md` is the living design doc. It
marks every decision 🔒 locked / 🟨 proposed / ❓ open. **Only 🔒-locked
mechanics are safe to model in the engine.** The round-loop phases in
`src/games/mastra-and-commander/Game.ts` are modeled precisely because §2 of
that doc is locked.

**Never invent rules from memory.** If a mechanic you need is still 🟨/❓, do
not guess an implementation — surface it to the owner with the specific open
question, an example, and a recommendation, and get sign-off first (see the
global working agreement in `~/CLAUDE.md`). Building the un-settled subset and
calling it done is a failure, not a caveat.

**Standing exception, owner-granted 2026-08-10:** for the *first-pass engine*,
the owner explicitly signed off on implementing best-guess placeholder rules for
every open question, so the game could be played and felt before the design
settles. That sign-off came with a condition: **every invention is tagged
`BEST-GUESS(Qn)` at its implementation site and listed in the README's
"Best-guess registry"**, which is the owner's audit surface. This exception does
NOT extend to new work — a mechanic added from here on still needs its own
sign-off, and any change to a registered best-guess must update the registry.

**Where the rules live:** balance and rule constants belong in `constants.ts`,
not scattered through the rules modules. Revising a best-guess should usually be
a one-line change there.

## Architecture rules

**Multi-game segregation is required.** Game-agnostic framework code lives
under `src/framework/`. Game-specific code lives under
`src/games/<game-id>/`. No mixing:

- A file in `framework/` must not import from any specific game.
- A game's code must not assume any other game exists.
- `src/framework/registry.ts` is the **ONE** place allowed to import from
  `src/games/...`, and only via each game's top-level `index.ts` entry point.

Locked-in layout:

```
src/
  main.tsx              Vite entry.
  App.tsx               Shell: game-select → (deck-import) → game. Framework
                        layer — imports games only via the registry.
  framework/
    GameSelect.tsx      Pick game + format + mode (localStorage memory).
    registry.ts         Game registry (the games/ import seam).
    types.ts            GameRegistration + DeckExport interfaces.
    DeckImport.tsx      File-picker + paste import of an exported deck JSON.
    storage.ts          localStorage helpers.
    savedGame.ts        Save / restore an in-progress game.
    replayTranscript.ts / replayVerifier.ts   Transcript record + verify.
    aiDriver.ts         Framework hook for a game's AI policy.
    Card*/HoverCardImage/cardImages   Card catalog + image helpers.
  games/
    mastra-and-commander/
      index.ts          Exports the GameRegistration.
      Game.ts           boardgame.io definition (round-loop phases; scaffold).
      Board.tsx         Renderer.
    tic-tac-toe/        boardgame.io hello-world; wiring baseline.
```

**Adding a game** = add `src/games/<id>/` with an `index.ts` exporting a
`GameRegistration`, then register it in `registry.ts`. Nothing else in the
framework should need to change.

**Game / format / mode selection on load** (framework behavior):

- First visit → pick game, then format, then play mode.
- Choice persisted in localStorage; returning visitors skip straight ahead.
- A "Switch game" link returns to the picker.

## What goes here

- boardgame.io `Game` definitions (state, moves, phases, end conditions).
- Board / UI components for in-game state.
- Pure-function rule helpers used by moves.
- Deck import flow (parse + validate an exported deck JSON), once this game
  defines decks.
- The game-selection / format-selection shell; eventual multiplayer + lobby.

## What does NOT go here

- Card catalog authoring or the printed-frame pipeline (that's
  `../mastra-and-commander/`).
- Card art *authoring* or Squib/SVG rendering.
- Any rules content not yet 🔒-locked in the design doc.

**Card art, precisely:** `public/cards/*.webp` are **derived assets** — the
design repo's rendered PNGs (`../mastra-and-commander/output/`) downscaled for
the web. They are checked in so a clone is playable, but they are NOT a source
of truth: never hand-edit them, and never author art here. To refresh, re-render
in the design repo and re-run the conversion (see the README's Card art section).
`CardFace` degrades to a text plate when a card's art is missing, so adding a
card before its art exists is fine.

## Working style notes (also see ~/CLAUDE.md for global rules)

- TypeScript strict; no `any` without justification.
- Truth in reporting: never claim "done/passing/works" without, in the same
  message, the command run and its result. `npm run typecheck` / `npm run
  build` / `npm test` are the gates.
- Keep framework code portable back to / from tcggg where reasonable — the two
  share the game-agnostic shell. Divergence is fine when this game needs it,
  but note it (see the "carried over from tcggg" section of the README).
- Never write rules / facts from memory; cite `game-design.md` and only model
  🔒-locked mechanics.
