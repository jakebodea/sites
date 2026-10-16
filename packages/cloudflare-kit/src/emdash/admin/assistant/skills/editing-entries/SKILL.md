---
name: editing-entries
description: How to change an EmDash entry safely as a draft. Load before the first content_create or content_update in a conversation, or when an update fails.
---

# Editing entries

## The loop

1. Find the entry: `content_list` for a collection, `search` when you only know some words on the page.
2. Read it with `content_get`. The response carries `_rev`; every update needs the `_rev` from your most recent read.
3. If you are unsure which fields a collection has, call `schema_get_collection`. Field types: `string`, `text`, `number`, `integer`, `boolean`, `datetime`, `select`, `multiSelect`, `slug`, `image`, `reference`, `repeater`, `json`, `portableText`, `blocks`.
4. Call `content_update` with `data` holding only the fields you change. Fields you leave out stay as they are.
5. Read it again with `content_get` if you need to make a second change: the `_rev` changed.

## Drafts

- An update to a published entry is staged as a draft; the live page keeps the old values until a person selects Publish. Say so in your reply.
- `content_compare` shows the live version beside the draft. Use it when asked "what changed?" or before summarising a multi-step edit.
- `revision_list` shows earlier versions. You cannot restore one; point the person to Revisions in the editor.
- `content_create` makes a new draft entry. Give it a clear `title`; a `slug` names its URL.

## Field values

- `string` and `text`: plain text. No Markdown, no HTML.
- `portableText` (rich text): send a Markdown string; EmDash converts it. Use headings, lists, bold, and links only as the existing text does.
- `image`: an object `{ "id": "<media id>", "alt": "…" }`. Find media ids with `media_list`. To change only the alt text, keep the `id` and every other property you read.
- `reference`: the id of the other entry, or an array of ids for a multi-reference.
- `repeater`: the complete array of items, each item with every property kept.
- `blocks` (page sections): load the `page-sections` skill first.

## When an update fails

- "changed since you read it" or a `_rev` error: someone saved in between. Read the entry again, re-apply your change to the new values, and retry once.
- A permission error: the person's account cannot do that. Tell them; do not try another way.
- A refusal from the assistant guard (publishing, search details, slug renames): explain that a person does that step in the editor.
