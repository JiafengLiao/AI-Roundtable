# Packaging And Release Pipeline

## References
- Tauri Windows installer docs: https://v2.tauri.app/distribute/windows-installer/
- Tauri GitHub Actions pipeline docs: https://v2.tauri.app/distribute/pipelines/github/
- Tauri updater docs: https://v2.tauri.app/plugin/updater/

## Local Commands
Use `npm.cmd` on Windows PowerShell.

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run tauri:dev
npm.cmd run build
npm.cmd run tauri:build
```

## PR CI
The PR pipeline runs on `windows-latest`:
- Checkout repo.
- Install Node LTS.
- Install Rust stable.
- Install npm dependencies.
- Run TypeScript typecheck.
- Build frontend.
- Run Tauri build smoke test.

PR CI must not publish release artifacts.

## Release CI
Release is triggered by either:
- Pushing a tag matching `app-v*`.
- Manual `workflow_dispatch`.

Release behavior:
- Build on `windows-latest`.
- Use `tauri-apps/tauri-action`.
- Create a draft GitHub release.
- Upload Windows installer artifacts.
- Keep release as prerelease until manually validated.

## Installer Strategy
MVP target is NSIS `setup.exe` because it is a familiar Windows installer format. MSI can be added later if enterprise distribution needs it.

## Signing And SmartScreen
MVP can ship unsigned internal builds, but unsigned Windows installers may trigger SmartScreen warnings. This must be documented in release notes.

Before beta/public distribution:
- Purchase or configure a code signing certificate.
- Add signing secrets to GitHub Actions.
- Validate installer reputation and update behavior.

## Auto Update
Automatic updates are Phase 2. Tauri updater requires signed update metadata. Private signing keys must never be committed or logged.
