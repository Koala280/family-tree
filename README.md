<p align="center">
  <img src="public/icon-192.svg" width="92" alt="Family Tree App icon">
</p>

<h1 align="center">Family Tree App</h1>

<p align="center">
  A local-first progressive web app to build, explore, and securely share family trees.
</p>

<p align="center">
  <a href="https://family-tree-k280.web.app"><strong>Live Demo</strong></a>
  .
  <a href="#quick-start"><strong>Quick Start</strong></a>
  .
  <a href="#features"><strong>Features</strong></a>
</p>

<p align="center">
  <a href="https://github.com/Koala280/family-tree/actions/workflows/ci.yml">
    <img src="https://github.com/Koala280/family-tree/actions/workflows/ci.yml/badge.svg" alt="CI status">
  </a>
  <img src="https://img.shields.io/github/license/Koala280/family-tree?cacheSeconds=300" alt="MIT license">
</p>

## Why This Project

Family Tree App is built for people who want a modern family tree tool without creating accounts or sending sensitive data to a backend by default.

- Local-first: data is stored in your browser.
- Fast editing: graph view plus table view for large trees.
- Privacy-focused export/import with password-based encryption.
- Installable as a PWA on desktop and mobile.

## Features

| Area | What you get |
| --- | --- |
| Tree management | Create and manage multiple family trees with metadata and timestamps. |
| Interactive graph | Link parents, children, and spouses directly in an interactive tree canvas. |
| Table workflow | Search, filter, and edit people quickly in a spreadsheet-like view. |
| Person data | Names, gender, dates, notes, profile photos, diseases, and cause of death. |
| Smart suggestions | Last-name suggestions from related persons and disease suggestion helpers. |
| Search and navigation | Search inside the tree and jump to matching persons. |
| Multi-language UI | German (`DE`), English (`EN`), Latvian (`LV`) plus custom language JSON import via `Custom`. |
| PWA support | Install prompt, offline shell caching, and share target/file handling. |
| Secure export/import | Encrypted JSON export/import with Web Crypto (AES-GCM + PBKDF2). |

## Quick Start

### Requirements

- Node.js 20+
- pnpm 9+ (recommended)

### Install and run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`.

### Production build

```bash
pnpm build
pnpm preview
```

## Usage Flow

1. Create a new family tree.
2. Add people and connect them via parent/spouse/child relations.
3. Switch between tree and table views depending on task.
4. Use search and filters to navigate larger trees.
5. Export your tree as an encrypted file for backup or sharing.
6. Import files back into the app when needed.

## Data, Privacy, and Security

- Tree data is stored encrypted in browser storage.
- No mandatory backend account is required for core usage.
- Export files can be password-protected before sharing.
- Rich-text notes are sanitized before persistence to reduce XSS risk.
- For vulnerability reports, see `SECURITY.md`.

## Tech Stack

- React 19
- TypeScript
- Vite

## Contributing and Community

- Contribution guide: `CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Security policy: `SECURITY.md`
- License: `MIT` in `LICENSE`
