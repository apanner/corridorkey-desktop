#!/usr/bin/env bash
# Cut a release from this PC (Marcy 2026-10-24: build here, upload the release; GitHub doesn't build).
#
#   tools/release.sh            the version in package.json: X.Y.Z (Stable) or X.Y.Z-dev.N (Development)
#
# 1. checks: on main, clean, in step with origin; package.json and the lock carry the version; a CHANGELOG
#    section for it; THIRD_PARTY_NOTICES.md is current (tools/gen_notices.mjs --check, which needs cargo-about
#    on PATH or CARGO_ABOUT=<path>)
# 2. npm run check, then npm run dist:linux (the engine for glibc 2.28, then the AppImage) and npm run dist:win (the
#    Windows engine cross-built here, then the NSIS installer through Wine), memory-capped
# 3. SHA256SUMS / SHA512SUMS of both files and the notes (the CHANGELOG section)
# 4. pushes main, creates the GitHub release as a draft on that commit (no tag yet), uploads, then publishes it,
#    which makes the tag (Development = prerelease, never Latest). A failure anywhere here can simply be rerun.
# The app does not update itself. New versions are this GitHub Release (update_plan.md phase 5 is the Tauri updater).
# Stops at the first failure; nothing is published before step 4. Rerunning after a failure finishes a draft.
# A release that is already published is left as it is. docs/RELEASING.md.
set -euo pipefail
cd "$(dirname "$0")/.."
CAP=(systemd-run --user --scope --quiet --collect ${CK_SLICE:+--slice=$CK_SLICE} -p MemoryMax=8G -p MemorySwapMax=0 --)

v="$(node -p 'require("./package.json").version')"
if [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then dev=false
elif [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+-dev\.[0-9]+$ ]]; then dev=true
else echo "release: version $v is neither X.Y.Z nor X.Y.Z-dev.N" >&2; exit 1; fi
[ "$(node -p 'require("./package-lock.json").version')" = "$v" ] || { echo "release: package-lock.json isn't at $v" >&2; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "release: not on main" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "release: uncommitted changes" >&2; exit 1; }
git fetch -q origin main
[ "$(git rev-list --count HEAD..origin/main)" = 0 ] || { echo "release: origin/main has commits this copy lacks" >&2; exit 1; }
# none = new; true = a draft left by a failed run (finished now); false = already published
state="$(gh release view "v$v" --json isDraft -q .isDraft 2>/dev/null || echo none)"
grep -q "^## $v\( \|$\)" CHANGELOG.md || { echo "release: CHANGELOG.md has no '## $v' section" >&2; exit 1; }
if [ "$state" = false ]; then echo "release: v$v is published already"; exit 0; fi
# cargo-about 0.9.2 lives with the other release tools (cargo install --locked --features cli cargo-about --root …)
export CARGO_ABOUT="${CARGO_ABOUT:-$HOME/.local/share/corridorkey-release/cargo-about/bin/cargo-about}"
"${CAP[@]}" node tools/gen_notices.mjs --check

NODE_OPTIONS=--max-old-space-size=4096 "${CAP[@]}" npm run -s check
NODE_OPTIONS=--max-old-space-size=4096 "${CAP[@]}" npm run -s dist:linux
NODE_OPTIONS=--max-old-space-size=4096 "${CAP[@]}" npm run -s dist:win

file="CorridorKey-Desktop-$v.AppImage"
winfile="CorridorKey-Desktop-$v-Setup.exe"
# loop: NOT-WORTH — the two release files
for f in "$file" "$winfile"; do [ -f "release/$f" ] || { echo "release: release/$f was not built" >&2; exit 1; }; done
(cd release && sha256sum "$file" "$winfile" > SHA256SUMS && sha512sum "$file" "$winfile" > SHA512SUMS)
# loop: NOT-WORTH — one pass over CHANGELOG.md for this version's section
awk -v v="$v" '$0 == "## " v || index($0, "## " v " ") == 1 {on=1; next} on && /^## / {exit} on' CHANGELOG.md > release/notes.md
[ -s release/notes.md ] || echo "See CHANGELOG.md." > release/notes.md
if [ "$dev" = true ]; then
  printf '\n**This is a development build**: newer than the stable release and less tested. Install it from this release.\n' >> release/notes.md
fi

git push origin main
flags=(--title "CorridorKey $v" --notes-file release/notes.md)
if [ "$dev" = true ]; then flags+=(--prerelease --latest=false); else flags+=(--latest); fi
[ "$state" = true ] || gh release create "v$v" --draft --target "$(git rev-parse HEAD)" "${flags[@]}"
gh release upload "v$v" "release/$file" "release/$winfile" release/SHA256SUMS release/SHA512SUMS --clobber
gh release edit "v$v" --draft=false
git fetch -q origin "refs/tags/v$v:refs/tags/v$v"
echo "release: v$v published"
