# Public Fonts

Drop the licensed **GT Alpina** woff2 files here (Grilli Type commercial license —
this repo does not distribute them). Use these exact filenames:

| Weight | File |
|--------|------|
| Regular (400) | `GT-Alpina-Regular.woff2` |
| Medium (500) | `GT-Alpina-Medium.woff2` |
| Bold (700) | `GT-Alpina-Bold.woff2` |
| Black (900) | `GT-Alpina-Black.woff2` |

The `@font-face` declarations in `src/styles/global.css` reference `/fonts/<file>`.
Until the files are present, `--font-serif` falls back to Prata (loaded from Google
Fonts) so the serif surfaces keep their didone character.
