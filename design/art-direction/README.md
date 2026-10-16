# Art direction canvas (source)

The source of the art direction review canvas (claude.ai Design canvas "Focus Forest Art Direction", private to the owner's account). The files are kept exactly as published, so the canvas can be rebuilt from this repo if the account or link changes.

- `canvas.json`: the layout of the artboards.
- `Main.dc.html`: the art direction sheet (docs/01 §1, §5, §6; docs/03 §7; docs/10 §1–§4).
- `Palette.dc.html`: the interface tokens and the proposed scene palette.
- `Tree.dc.html`: the signature tree, drawn three ways (soft, painterly, paper-cut), three lights, seven stages.
- `Directions.dc.html`, `Stages.dc.html`: the comparisons built from it.
- `Badges.dc.html`: badge frames per category, rarity treatments, and the line icon style.

**Owner decision (2026-10-16):** direction **B, painterly-flat**. The app's renderer follows it; the canvas is a reference, not shipped code.

These files are reference only and are not part of the app bundle. Source of every shipped asset: `src/release/asset-sources.ts`.
