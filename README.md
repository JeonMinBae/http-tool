# HTTP Tool

Lightweight HTTP client for macOS and Windows (Tauri 2 + React).

## Development

- `npm run tauri dev` — run the app
- `npm test` — frontend unit tests
- `npm run test:rust` — Rust tests

## Build

- macOS: `npm run tauri build` → `src-tauri/target/release/bundle/dmg/*.dmg`.
  If the dmg step fails (it drives Finder via AppleScript), run `sh scripts/make-dmg.sh` instead.
- Windows: `npm run tauri build` → `src-tauri/target/release/bundle/msi/*.msi`
  (requires the MSVC Build Tools and the WebView2 runtime).
