# Releasing CorridorKey Desktop

The app does not update itself. A release is a GitHub Release: the Linux AppImage and the Windows installer.
People install the next version from that release. The Tauri updater in `update_plan.md` (phase 5) is the
replacement for the old Electron self-update (`latest.json` on `main`).

Model and runtime downloads are separate. Their repository is `REPO` in `electron/main/install.ts`.

## Cutting a release

Releases are built on this PC and uploaded (Marcy 2026-10-24: GitHub doesn't build them; a CI Linux build once
spent 29 minutes waiting on a package mirror).

1. Set the version (package.json and the lock together):
   `npx -y npm@10.9.2 version X.Y.Z-dev.N --no-git-tag-version` (Development) or `… X.Y.Z …` (Stable).
   Add its `## X.Y.Z-dev.N` section to `CHANGELOG.md` (the release notes are that section). Commit on `main`.
2. `tools/release.sh`. It checks the version shape (`X.Y.Z` = Stable, `X.Y.Z-dev.N` = Development), the lock, a
   clean `main` in step with GitHub, and the CHANGELOG section; runs `npm run check` and
   `npm run dist:linux` (memory-capped; the engine is linked for glibc 2.28 with cargo-zigbuild, Zig in
   `~/.local/share/corridorkey-release/zig/venv`; then `tools/build_trt_builder.sh` builds TensorRT's engine builder
   `ck-trt-build` with Zig's C++ for glibc 2.28 and the AppImage ships it next to the engine. It links against
   libnvinfer / libnvonnxparser from NVIDIA's pinned `tensorrt-cu13-libs` 10.16.1.11 wheel, the one the app's
   TensorRT download uses, cached and SHA-256-checked in `~/.local/share/corridorkey-release/tensorrt` (3.7 GB,
   downloaded once; only the two libraries are unpacked)) and `npm run dist:win` (the Windows engine cross-built with
   MinGW-w64, the NSIS installer through Wine); writes `SHA256SUMS` / `SHA512SUMS` of the AppImage and the
   `-Setup.exe`; pushes `main`; creates the release as a draft on that commit, uploads, and publishes it, which
   makes the `vX.Y.Z…` tag (Development as a **prerelease**, never *Latest*; Stable as *Latest*).
3. If it fails partway, run it again: a draft release is picked up and finished. A release that is already
   published is left as it is.

### macOS (Apple Silicon)

There is no Mac here and no cross-build from Linux without Apple's SDK, so the macOS disk image is built on
GitHub's macOS runner: `gh workflow run macos.yml --ref main` (on demand only, never on every push). It runs the
app's and the engine's checks on macOS, builds the engine for `aarch64-apple-darwin` and the arm64 `.dmg`
(`npm run dist:mac`), installs it as a user does (a quarantined download into /Applications, Gatekeeper's answers
recorded), starts it and screenshots every page. The image and the screenshots are the run's artifacts; download
the image with `gh run download` and upload it to the release with the others. The runner is a virtual Mac without
the GPU or the Neural Engine: it proves the build and the app, not keying speed.

Signing (since 2026-10-24): the image is signed with Marcy's Developer ID Application certificate (team
FTQ95W942L, valid to 2027-11-23) with the hardened runtime (`build/entitlements.mac.plist`: V8's JIT, and
disable-library-validation so the engine can load ONNX Runtime's library from PyPI), notarized with an App Store
Connect API key (Developer role) and stapled. The workflow's build step is the only one that gets the secrets
(`MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`); the next step
fails unless codesign, stapler and Gatekeeper accept the app as a notarized Developer ID app. The keys' originals
are in `~/.config/corridorkey-release/apple/` and Marcy's vault; the certificate is renewed before it expires
(a new .p12 into `MAC_CSC_LINK`). Without the variables (a local `npm run dist:mac`) the image is unsigned.

A development build is a prerelease. A stable release goes out when its planned set is done and Marcy has done
her QC.
