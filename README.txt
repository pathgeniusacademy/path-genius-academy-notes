Path Genius Notes - Netlify build fix

Replace these 2 files in the ROOT of the GitHub repo:
1. tsconfig.node.json
2. vite.config.ts

Why:
- Removes the invalid allowImportingTsExtensions setting that conflicts with `tsc -b`.
- Removes Node-only `path` / `__dirname` usage from the ESM Vite config.

Commit:
Fix Notes Netlify build
