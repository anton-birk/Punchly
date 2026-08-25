# Punchly

A macOS time tracker for [OpenProject](https://www.openproject.org/). Sits in your menu bar — browse work packages, start a timer, log time directly to OpenProject.

## Features

- Browse and search work packages across all your projects
- One-click timer per task — start, stop, log
- Idle detection: detects when you step away and offers to deduct idle time
- Create new tasks with assignee, version, attachments
- Offline-aware: timer keeps running without internet, syncs when back online
- Light / dark theme

## Requirements

- macOS 12+, Windows 10+, or Linux (Ubuntu 22.04+)
- OpenProject instance with API access (API key)

## Installation

Download the latest release for your platform from [Releases](../../releases):

| Platform                      | File                              |
| ----------------------------- | --------------------------------- |
| macOS (Intel + Apple Silicon) | `.dmg`                            |
| Windows                       | `.exe` (NSIS installer) or `.msi` |
| Linux                         | `.AppImage` (universal) or `.deb` |

> **macOS — first launch on a new Mac:** if Gatekeeper blocks the app, go to **System Settings → Privacy & Security → Open Anyway**.
>
> **Linux AppImage:** `chmod +x Punchly_*.AppImage && ./Punchly_*.AppImage`

## Setup

1. Open Punchly → go to **Settings**
2. Enter your OpenProject URL (e.g. `https://your-instance.openproject.com`)
3. Enter your API key — find it in OpenProject under **My Account → Access tokens**
4. Click **Save & Test**

## Building from source

**Prerequisites:** Rust (stable), Bun, Xcode Command Line Tools

```sh
git clone https://github.com/anton-birk/punchly.git
cd punchly
bun install
bun run tauri dev
```

**Production build:**

```sh
bun run tauri build
# Output: src-tauri/target/release/bundle/dmg/
```

**macOS universal binary (Intel + Apple Silicon):**

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
bun run tauri build --target universal-apple-darwin
```

**Windows / Linux** (run natively on the target OS):

```sh
bun run tauri build
```

## Releasing

1. Update `version` in `tauri.conf.json` and `src-tauri/Cargo.toml`
2. Commit and push
3. Create a tag: `git tag v0.2.0 && git push origin v0.2.0`
4. GitHub Actions builds a universal `.dmg`, creates a **draft** release
5. Review and publish the draft on GitHub

## Signing & Notarization (for distribution)

Without signing, macOS Gatekeeper will warn users on first launch. To distribute properly, add these secrets to your GitHub repository (**Settings → Secrets → Actions**):

| Secret                       | How to get it                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`          | Export your **Developer ID Application** cert from Keychain as `.p12`, then `base64 -i cert.p12`                     |
| `APPLE_CERTIFICATE_PASSWORD` | The password you set when exporting the `.p12`                                                                       |
| `APPLE_SIGNING_IDENTITY`     | Run `security find-identity -v -p codesigning` — copy the full string like `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID`                   | Your Apple Developer account email                                                                                   |
| `APPLE_PASSWORD`             | App-specific password — create at [appleid.apple.com](https://appleid.apple.com)                                     |
| `APPLE_TEAM_ID`              | 10-character team ID from [developer.apple.com/account](https://developer.apple.com/account)                         |

macOS signing requires a paid **Apple Developer Program** membership ($99/year).

**Windows signing** — add `WINDOWS_CERTIFICATE` (base64 `.pfx`) and `WINDOWS_CERTIFICATE_PASSWORD` to GitHub Secrets. Without it the installer is unsigned but functional.

**Linux** — no signing needed.

## Tech stack

- [Tauri v2](https://tauri.app) — native shell
- React 19 + TypeScript
- Tailwind CSS v4
- OpenProject API v3
