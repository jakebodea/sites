---
name: photos-and-alt-text
description: Working with photos on entries: finding media, swapping a photo, and writing alt text with describe_photo. Load for any photo or alt-text request.
---

# Photos and alt text

## Finding photos

- On an entry, image values look like `{ "id": "…", "src": "…", "alt": "…" }`, inside image fields, repeaters (galleries), or section fields.
- `media_list` lists the media library; `media_get` gives one item's file name, size, dimensions, and alt text.
- You cannot upload new photos. If the right photo is not in the library, ask the person to upload it under Media first.

## Swapping a photo

Set the image value's `id` to the new media id and keep or rewrite `alt` to match the new photo. Keep any other properties the value had.

## Writing alt text

1. Call `describe_photo` with the media id to see what the photo shows. Never write alt text from the file name. If you have no `describe_photo` tool, this site has photo descriptions turned off: say so instead of guessing.
2. Write one plain sentence fragment under 125 characters that says what matters about the photo on this page: the work, the place, the people's role. Example: "Electricians installing lighting conduit in a school gymnasium ceiling".
3. Do not start with "Image of" or "Photo of", do not stuff keywords, and do not claim things the photo does not show (a project name, a location) unless the entry itself states them; then you may use the entry's wording.
4. A purely decorative image (a texture, a divider) gets empty alt text "".
5. Set `alt` on the image value in the entry and save with `content_update`. The page reads alt text from the entry, not from the media library.

Report how many photos you described and on which entries.
