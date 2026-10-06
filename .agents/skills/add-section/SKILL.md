---
name: add-section
description: Add a new editable content block (section) to a site's pages, wired through the EmDash schema, Astro rendering, and seed content. Use when a page needs a new kind of section.
---

# Add a section

Sections are EmDash block types rendered by Astro components. Editors add and reorder them in the CMS.

1. **Schema**: add a block type to `seed/seed.json` → `blockTypes` (fields with types and labels), and allow it on the collection field that holds page content.
2. **Types**: `bun --cwd apps/<site> run types`.
3. **Render**: create `src/components/blocks/<name>.astro` (static markup, Tailwind, no client JS) and register it in `src/components/blocks/page-blocks.astro`. Only reach for a React island in `src/components/islands/` if it truly needs interactivity.
4. **Seed**: add an example instance to the relevant page in `seed/seed.json` so fresh stages show it.
5. **Verify**: `bun run app -- reset`, screenshot the page at 1280 and 375, open the editor with `screenshot /_emdash/admin/content/pages --auth`, then `bun run ci` and proof.
