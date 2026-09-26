# focus-forest-mobile — Claude Instructions

Claude: read and follow **`./AGENTS.md`** (this repo's rules) and **`../AGENTS.md`** (workspace rules) before making changes. This file only points you there.

- Product source of truth: `../focus_forest_product_features.md`
- Docs and reading guide: `../docs/README.md`
- For UI work, read the design, UX, tree, and animation docs first (`../docs/01`–`04`).

Key reminders: tokens only (no arbitrary colors, spacing, or radii). The tree is the Home hero. Animation stays calm and respects reduced motion. The tree never dies. The client displays product truth from the API and never computes it. Build the current phase only. Later phases are planned scope, not optional.

Test first: write tests for the documented behavior, see them fail, then implement until `npm run check` passes.

If a request conflicts with the product or design docs, flag it. Don't silently diverge. Don't commit unless asked.
