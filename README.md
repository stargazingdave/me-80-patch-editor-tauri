# me-80-patch-editor

A native Windows patch editor and librarian for the BOSS ME-80. This version uses Tauri 2, Rust, React, TypeScript, Vite, and the Windows WebView2 runtime.

## End-user requirements

- 64-bit Windows 11
- The official BOSS ME-80 Windows driver
- An ME-80 connected over USB and powered on

Node.js, npm, Electron, and Rust are not required to install or run the packaged application. Windows 11 includes the WebView2 runtime used by Tauri.

Close DAWs, editors, and MIDI monitors that may already have the ME-80 ports open before starting the application.

## Development

Install the current stable Rust toolchain, Tauri CLI, Node.js, and pnpm. Install the frontend dependencies once, then run:

```powershell
pnpm install
pnpm typecheck
cargo test
cargo tauri dev
```

Vite provides React Fast Refresh while `cargo tauri dev` is running. Frontend-only development can also be started in a browser with `pnpm dev`; native MIDI actions require the Tauri window.

The React frontend is organized by responsibility:

```text
ui/
  app/          application composition and coordination
  components/   shared presentational components
  domain/       shared UI domain types
  features/     device, editor, library, and settings features
  hooks/        reusable application hooks
  lib/          framework-independent helpers and tests
  services/     Tauri API access
  styles/       global tokens, resets, and shared CSS modules
  types/        ambient TypeScript declarations
```

Feature-specific components, hooks, and CSS modules stay inside their feature directory.

Create the optimized x64 NSIS installer with:

```powershell
cargo tauri build
```

The installer is written to `target\release\bundle\nsis\`.

## Data

Backups and pre-write recovery files are stored under `Documents\me-80-patch-editor\backups`. If the preferred directory does not yet exist, the application continues to detect the legacy `Documents\ME-80 Patch Lab` directory.

## MIDI safety

The Rust backend preserves the guarded workflow of the original editor: exact normal `ME-80` endpoint names, single requests without retries, checksum validation, complete 71-byte readback verification, temporary-memory audition, explicit user-slot confirmation, and a recovery capture before a permanent write.
