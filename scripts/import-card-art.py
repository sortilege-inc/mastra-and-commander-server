#!/usr/bin/env python3
"""Import rendered card art from the design repo into `public/cards/`.

The design repo (`../mastra-and-commander`) is the source of truth for card
art: Squib renders `cards/cards.yml` through the Ice Chrome frame into
`output/card_NN.png` at print resolution, plus the two deck backs. This script
mirrors those into web assets — downscaled and WebP-encoded, ~16 MB -> ~1 MB.

    python3 scripts/import-card-art.py

Faces are renamed from their position in cards.yml to the ENGINE CARD ID, so
the UI can address them directly (`/cards/TEST-OP-AGENT.webp`). That mapping is
positional, which is fragile by nature, so the script refuses to run when the
image count and the id list disagree rather than silently misaligning every
card. If you add or remove a card, update ORDERED_IDS to match cards.yml.

Requires Pillow (`pip install Pillow`).
"""
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit('Pillow is required: pip install Pillow')

REPO = Path(__file__).resolve().parent.parent
SRC = REPO.parent / 'mastra-and-commander' / 'output'
DST = REPO / 'public' / 'cards'

FACE_WIDTH = 600   # readable in the hover preview (400px) at 1.5x
BACK_WIDTH = 400   # never shown large
QUALITY = 82

# cards.yml order -> engine card id (src/games/mastra-and-commander/cards/cardSet.ts).
# The first playable 15-card set (owner's rules pass, 2026-08-13).
ORDERED_IDS = [
    'MASTRA',
    'OP-AGENTBROWSER', 'OP-SOCIAL-MEDIA-MANAGER', 'OP-HUMAN-IN-THE-LOOP',
    'OP-Y-COMBINATOR',
    'FEAT-PARALLELISM',
    'EN-TOKEN-LIMITER', 'EN-PII-LEAK', 'EN-JAILBREAK', 'EN-MODEL-COLLAPSE',
    'EV-PERSONAL-TECH-SUPPORT', 'EV-RECRUITER-AGENT',
    'MODEL-FABLE',
    'LOADOUT-SANDBOX',
    'TOKEN-AGENT',
]

BACKS = {'back_operator.png': 'back-operator', 'back_entropy.png': 'back-entropy'}


def emit(src: Path, out: Path, width: int) -> int:
    with Image.open(src) as im:
        height = round(im.height * width / im.width)
        im.convert('RGB').resize((width, height), Image.LANCZOS).save(
            out, 'WEBP', quality=QUALITY, method=6)
    return out.stat().st_size


def main() -> int:
    if not SRC.is_dir():
        sys.exit(f'No design-repo output at {SRC} — render the cards there first.')

    faces = sorted(SRC.glob('card_*.png'))
    if len(faces) != len(ORDERED_IDS):
        sys.exit(f'ABORT: {len(faces)} rendered faces but {len(ORDERED_IDS)} ids. '
                 'The positional mapping would misalign every card — re-render, '
                 'or update ORDERED_IDS to match cards.yml.')

    DST.mkdir(parents=True, exist_ok=True)
    total = written = 0
    for src, card_id in zip(faces, ORDERED_IDS):
        total += emit(src, DST / f'{card_id}.webp', FACE_WIDTH)
        written += 1

    for filename, name in BACKS.items():
        src = SRC / filename
        if not src.exists():
            print(f'  ! missing {filename} — skipped', file=sys.stderr)
            continue
        total += emit(src, DST / f'{name}.webp', BACK_WIDTH)
        written += 1

    source_bytes = sum(f.stat().st_size for f in faces)
    print(f'{written} images -> {DST.relative_to(REPO)} '
          f'({total / 1_048_576:.1f} MB, from {source_bytes / 1_048_576:.1f} MB of PNGs)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
