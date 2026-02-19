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
  <img src="https://img.shields.io/github/license/Koala280/family-tree" alt="MIT license">
  <img src="https://img.shields.io/badge/PWA-ready-0A7A3D" alt="PWA ready">
  <img src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.6">
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
| Multi-language UI | German (`DE`), English (`EN`), Latvian (`LV`). |
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

- Data is stored in browser `localStorage`.
- No mandatory backend account is required for core usage.
- Export files can be password-protected before sharing.
- Encryption uses modern browser Web Crypto primitives (AES-GCM with PBKDF2 key derivation).
- For vulnerability reports, see `SECURITY.md`.

## Deployment

This project is set up for Firebase Hosting.

```bash
pnpm build
firebase deploy --only hosting
```

First-time Firebase setup:

1. Install Firebase CLI: `pnpm add -g firebase-tools`
2. Authenticate: `firebase login`
3. Select project: `firebase use --add`

## Tech Stack

- React 19
- TypeScript
- Vite
- Firebase Hosting

## Contributing and Community

- Contribution guide: `CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Security policy: `SECURITY.md`
- License: `MIT` in `LICENSE`
