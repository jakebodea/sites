---
name: page-sections
description: How a page's sections (a `blocks` field, such as `content` on pages) are structured and edited. Load before changing, adding, reordering, or removing any section.
---

# Page sections

A page's sections are one `blocks` field: an ordered array where each item is one section, for example a hero, a services list, a call to action, or a block of rich text.

## Shape

Every item has:

- `_type`: the block type's slug, such as `hero` or `cta_band`.
- `_key`: a stable id for that item. Never change or drop an existing `_key`; EmDash matches items by it.
- the block type's own fields.

Read a block type's fields with `schema_get_block_type` (slug from `_type`). `schema_list_block_types` lists every type the site has.

## Editing

- Send the whole array back in `content_update`, every item in order, each with its `_type` and `_key`, even items you did not touch. A missing item is removed from the page.
- To edit one section, copy the array from `content_get`, change only that item's fields, and send it all.
- To add a section, insert an item with a new unique `_key` (short random letters and digits) and only fields its block type defines. Ask where it should go if the request does not say.
- To remove one, drop it from the array and say which section you removed.
- To reorder, move items; keep their keys.
- Rich text inside a section follows the same rule as everywhere: a Markdown string.
- Do not set `replaceBlocks` or `migrateBlocks`.

## Before you summarise

Name sections the way a person sees them ("the banner at the top", "the call-to-action strip"), not by `_type` or `_key`.
