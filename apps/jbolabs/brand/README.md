# Share images and icons

The share cards match the homepage: white, blue-black ink, lowercase Montserrat 300 with Montserrat 700 emphasis, and Figtree supporting text. The footer has only the domain. The icons use the bold `jbo` part of the wordmark.

`og-default.png` is the 1200 × 630 Open Graph and Twitter card. `og-square.png` is a 1200 × 1200 variant for manual sharing. The favicon, Apple touch icon, and 512 px icon are rendered together.

## Regenerate

Prepare static TTFs from Google Fonts' Montserrat and Figtree variable fonts with FontTools' `fonttools varLib.instancer` command, pinning the `wght` axis to 200, 300, and 700 for Montserrat, and 400 for Figtree. Name the files `montserrat-200.ttf`, `montserrat-300.ttf`, `montserrat-700.ttf`, and `figtree-400.ttf` in a local fonts directory.

From this app directory, run:

```bash
uv run --with pillow python brand/render.py <fonts-dir> public
```

Commit the generated PNGs. When changing them, bump the image version query in `src/layouts/base.astro` and `src/components/structured-data.astro` so newly shared links request the new assets. Previously cached previews may require a platform refresh.
