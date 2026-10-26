# CorridorKey Desktop: update plan

Goal: a small desktop app that keeps itself and its heavy assets up to date, with no heavy files in git.

Fork: `apanner/corridorkey-desktop`. Upstream: `MarcelineVPQ/corridorkey-desktop` (add it as the `upstream` remote and merge `upstream/main` into a branch when Marcy publishes changes).

## 1. Principles

- **Repo = code only.** No models, runtimes, or installers in git. Keep clones fast.
- **Three update channels, independent of each other:**
  1. App shell (Tauri): new installer or in-place update, signed.
  2. Engine: the `corridorkey-engine` binary, versioned with the protocol.
  3. Assets: ONNX Runtime and CUDA libraries, model sets, TensorRT files, ffmpeg (if we ship it).
- **Everything downloaded is verified** (SHA-256 from a signed manifest) before use.
- **Downloads resume** after a crash or network loss.
- **The user is never surprised:** updates download in the background; the app installs them when the queue is idle, and asks before any restart.
- **Rule 11 still holds:** no GPU work and no download-driven CPU spikes while a job is running.

## 2. Where each thing lives

| Item | Source today | Target |
|---|---|---|
| App code | this repo | this repo, built by CI |
| App installer / updates | Electron self-update removed (signed `latest.json` on `main`, App settings → Updates) | Tauri updater: `latest.json` attached to each GitHub Release, signed with our key |
| Engine binary | built locally by `tools/build_engine.sh` | built by CI, attached to the app release, same version |
| Models (per set) | GitHub Release tag `models-<set>` | GitHub Release tag `models-<set>`, split into parts under 2 GB each |
| TensorRT models | GitHub Release | same pattern, its own tag |
| ONNX Runtime, NVIDIA libs | PyPI wheels, pinned by size and SHA-256 | unchanged (PyPI is the source; nothing re-hosted) |
| ffmpeg | system install, offered by the app | unchanged; app checks for it and offers the install |

## 3. The asset manifest (new)

One JSON file, `assets.json`, published as an asset on a GitHub Release and signed like the app update.

```json
{
  "schema": 1,
  "generated": "2026-10-26",
  "items": [
    {
      "id": "runtime-onnx",
      "version": "1.31.0",
      "platform": "windows-x64",
      "size": 1234567890,
      "sha256": "…",
      "parts": [
        { "url": "https://github.com/apanner/corridorkey-desktop/releases/download/runtime-1.31.0/part-1", "size": 1900000000, "sha256": "…" }
      ]
    },
    { "id": "models-2.0.0-onnx.4", "version": "2.0.0-onnx.4", "platform": "any", "size": 3300000000, "sha256": "…", "parts": [] }
  ]
}
```

- The app keeps `installed.json` (id, version, sha256 per file) in its data folder.
- On start, and once a day while idle: fetch `assets.json`, compare versions, download only items whose version changed.
- Each part is downloaded to `*.partial`, checked, then renamed. Existing `partial.ts` logic handles the resume; we keep it and extend it to parts.
- A failed hash deletes the part and retries once, then reports the error in the UI.

## 4. Auto-update flow

**App (Tauri updater).** The Electron self-updater is removed. This flow is phase 5.
1. Check `latest.json` from the latest GitHub Release on start and every 24 hours.
2. If newer: download in the background, verify the signature (updater key, separate from Windows code signing).
3. Show "Update ready" in the UI. Restart only when the queue is idle and the user confirms.

**Engine**
- Ships inside the app installer, so it updates with the app.
- The protocol version is checked on connect (`PROTOCOL` in `engine/`). If the app and engine disagree, the app shows a clear message instead of failing mid-job.

**Assets**
- Use the manifest flow in section 3.
- Model updates never run during a job. They wait for the queue to be idle.
- TensorRT builds run in the background (as today), paused while keying.

## 5. Phases

Each phase ends with something runnable.

| Phase | Work | Done when |
|---|---|---|
| 0 | Tauri 2 scaffold on branch `tauri`; the React UI runs in the Tauri window; `window.ck` adapter with stub commands | the UI opens and shows state |
| 1 | Settings, storage paths, cache folder, clip probing (ffprobe), thumbnails via a custom protocol | adding clips shows thumbnails |
| 2 | Engine client (JSON lines over stdio), queue, job state, cancel, job logs | a clip keys end to end on Windows |
| 3 | Manifest fetch, resumable download, hash check, unzip; first-run setup uses it | fresh install downloads runtime and models from the manifest |
| 4 | Asset updates: compare `installed.json` with `assets.json`, update only what changed | changing a model version in the manifest updates the installed copy |
| 5 | App updater: `latest.json` on GitHub Releases, signing, "Update ready" UI | an installed build updates to the next release |
| 6 | CI: build Windows installer and engine on tag push, publish release and assets | a tag produces a release with no manual steps |
| 7 | Port the gates and tests (`check_electron_security.sh`, unit tests) and the Linux AppImage | `npm run check` passes on the new stack |

Phases 3 to 5 carry most of the risk. Phase 3 replaces the current install flow, which is about 700 lines.

## 6. Build on Windows (prerequisites)

- Node 22 or newer, Rust stable with the MSVC target, Visual Studio Build Tools (C++ workload), CMake, WebView2 (already present on Windows 10/11).
- The engine's OpenColorIO is built from source (`ocio-rs/bundled`): first build takes minutes.
- `ort-static` may download ONNX Runtime at build time: needs internet during the build.
- Known gap: the repo's cross-build patches target MinGW. A native MSVC build of the engine is unverified. Phase 2 starts by proving it builds on this PC.

Commands (after Phase 0):

```powershell
cd d:\dev\corridor_key
npm install
npm run tauri dev
npm run tauri build
```

## 7. Decisions still open

1. Windows only first, or Windows and Linux together? (Recommend: Windows first; the Linux AppImage follows in phase 7.)
2. Keep `engine/ck_engine.py` (PyTorch reference) in the app, or keep it only as a dev-time benchmark? (Recommend: dev-time only.)
3. Updater signing key: generate with `tauri signer generate`; store the private key outside the repo (GitHub secret for CI). Confirm you're fine with that.
4. Windows code signing (Authenticode) to remove the SmartScreen warning: a certificate costs money. Decide when to buy it.
5. Licence: the CorridorKey licence (CC BY-NC-SA 4.0 variant) requires attribution and the same terms on the fork. Keep `LICENSE`, `THIRD_PARTY_NOTICES.md`, and the credits in every release.

## 8. Size expectations (honest)

- The Tauri shell replaces Electron's bundled Chromium; expect an installer in the low tens of MB, not a few MB, once the app includes the engine.
- The heavy assets (about 2.4 GB runtime, 3.3 GB models on Windows) still download on first run. Tauri does not change that; only the manifest and resume logic make it reliable.

## 9. Testing

- Unit: manifest parsing, version comparison, part assembly, hash verification, resume after a cut connection (local HTTP server in tests).
- Integration: a test manifest on a local server; install, update one asset, install an app update to a test feed.
- Manual on Windows: fresh install, offline start, interrupted download, update while idle, update requested during a job (must wait).
- Isolated test copies only (rule 12), so the real settings and keys are never touched.

## 10. Next steps

1. Confirm the decisions in section 7 (short answers are fine).
2. Start phase 0 on branch `tauri` in `d:\dev\corridor_key`.
3. First milestone: the UI runs in the Tauri window on this PC.
