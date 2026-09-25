#!/usr/bin/env bash
# Linux and macOS setup entry point, invoked by the app's fixed terminal action.
# Usage: bash lean-setup.sh [certificate-directory] [app-owned-status-directory]
set -Eeuo pipefail
project_dir="${1:-}"
if [ "$(uname -s)" = Darwin ]; then
  default_status_dir="$HOME/Library/Application Support/Axiovela Math/lean-setup"
else
  default_status_dir="${XDG_DATA_HOME:-$HOME/.local/share}/axiovela-math/lean-setup"
fi
status_dir="${2:-$default_status_dir}"
export ELAN_HOME="${ELAN_HOME:-$HOME/.elan}"
mkdir -p "$status_dir"
if [ -f "$status_dir/lock/pid" ]; then
  previous_pid="$(cat "$status_dir/lock/pid")"
  if [[ "$previous_pid" =~ ^[0-9]+$ ]] && ! kill -0 "$previous_pid" 2>/dev/null; then rm -rf "$status_dir/lock"; fi
fi
if ! mkdir "$status_dir/lock" 2>/dev/null; then
  printf '%s\n' 'Setup is already running. Finish or close its terminal before retrying.' >&2
  exit 1
fi
printf '%s\n' "$$" > "$status_dir/lock/pid"
setup_temp="$(mktemp -d)"
finish() {
  result=$?
  if [ "$result" -ne 0 ]; then
    printf '%s\n' failed > "$status_dir/state"
    printf '\nSetup did not complete (exit %s). Read the error above, then retry from the app.\n' "$result"
  fi
  rm -rf "$setup_temp" "$status_dir/lock"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
exec > >(tee "$status_dir/output.log") 2>&1
stage() { printf '%s\n' "$1" > "$status_dir/state"; printf '\n%s\n' "$2"; }
stage prerequisites 'Checking prerequisites…'
missing_packages=()
for tool in curl git tar; do
  if ! command -v "$tool" >/dev/null; then
    missing_packages+=("$tool")
  fi
done
if command -v sha256sum >/dev/null; then
  checksum_files() { sha256sum "$@"; }
elif command -v shasum >/dev/null; then
  checksum_files() { shasum -a 256 "$@"; }
else
  missing_packages+=(checksum-utility)
fi
if [ "${#missing_packages[@]}" -gt 0 ]; then
  if [ "$(uname -s)" = Darwin ]; then
    printf 'Missing macOS command-line utilities: %s. Install Apple Command Line Tools with xcode-select --install, then retry.\n' "${missing_packages[*]}" >&2
    exit 1
  fi
  printf 'Installing missing Linux utilities: %s. Your administrator password may be requested.\n' "${missing_packages[*]}"
  elevate=()
  if [ "$(id -u)" -ne 0 ]; then elevate=(sudo); fi
  if command -v apt-get >/dev/null; then "${elevate[@]}" apt-get install -y "${missing_packages[@]}"
  elif command -v dnf >/dev/null; then "${elevate[@]}" dnf install -y "${missing_packages[@]}"
  elif command -v pacman >/dev/null; then "${elevate[@]}" pacman -S --needed --noconfirm "${missing_packages[@]}"
  elif command -v zypper >/dev/null; then "${elevate[@]}" zypper --non-interactive install "${missing_packages[@]}"
  else printf '%s\n' 'No supported package manager found. Install curl, git, tar and coreutils with your Linux software manager, then retry.' >&2; exit 1
  fi
fi
stage installing 'Installing Lean tools. First setup downloads a compiler and may take several minutes…'
if [ ! -x "$ELAN_HOME/bin/elan" ]; then
  curl --fail --show-error --location --retry 3 https://elan.lean-lang.org/elan-init.sh -o "$setup_temp/elan-init.sh"
  sh "$setup_temp/elan-init.sh" -y --no-modify-path --default-toolchain none
fi
export PATH="$ELAN_HOME/bin:$PATH"
if [ -n "$project_dir" ]; then
  mkdir -p "$project_dir"
  cd "$project_dir"
  if [ ! -f lean-toolchain ]; then
    if [ -e lakefile.lean ] || [ -e lakefile.toml ] || [ -e lake-manifest.json ]; then
      printf '%s\n' 'This existing project has no pinned Lean version. Ask the assistant to repair its environment, then retry.' >&2
      exit 1
    fi
    (set -C; printf '%s\n' leanprover/lean4:v4.19.0 > lean-toolchain)
  fi
else
  cd "$setup_temp"
  printf '%s\n' leanprover/lean4:v4.19.0 > lean-toolchain
fi
toolchain="$(tr -d '\r\n' < lean-toolchain)"
if [[ ! "$toolchain" =~ ^leanprover/lean4:v[0-9]+\.[0-9]+\.[0-9]+(-rc[0-9]+)?$ ]]; then
  printf '%s\n' 'Setup needs a pinned official Lean 4 release. Ask the assistant to inspect and pin this project first.' >&2
  exit 1
fi
"$ELAN_HOME/bin/elan" toolchain install "$toolchain"
"$ELAN_HOME/bin/elan" run "$toolchain" lean --version
"$ELAN_HOME/bin/elan" run "$toolchain" lake --version
stage dependencies 'Preparing the project libraries. Mathlib can require several GB of disk space…'
if [ ! -e lakefile.lean ] && [ ! -e lakefile.toml ]; then
  if [ -e lake-manifest.json ]; then
    printf '%s\n' 'A dependency lock exists without its Lake configuration. Ask the assistant to restore the configuration.' >&2
    exit 1
  fi
  if [ -n "$project_dir" ]; then
    (set -C; printf 'name = "AxiovelaCertificate"\nversion = "0.1.0"\n\n[[require]]\nname = "mathlib"\nscope = "leanprover-community"\ngit = "https://github.com/leanprover-community/mathlib4.git"\nrev = "%s"\n' "${toolchain#leanprover/lean4:}" > lakefile.toml)
  else
    printf 'name = "AxiovelaSetupCheck"\nversion = "0.1.0"\n' > lakefile.toml
  fi
fi
# Existing locks and source are preserved. Lake resolves missing dependencies.
if [ ! -f lake-manifest.json ]; then lake --keep-toolchain update; fi
import_line=''
printf '%s\n' no > "$status_dir/mathlib"
if grep -Eq '"name"[[:space:]]*:[[:space:]]*"mathlib"' lake-manifest.json; then
  lake exe cache get
  import_line='import Mathlib'
  printf '%s\n' yes > "$status_dir/mathlib"
fi
stage checking 'Checking the installed compiler and project imports with a small theorem…'
printf '%s\nexample (n : Nat) : n + 0 = n := by simp\n' "$import_line" > "$setup_temp/SetupCheck.lean"
lake env lean "$setup_temp/SetupCheck.lean"
# Record actual paths and a fingerprint only after the compiler succeeds.
"$ELAN_HOME/bin/elan" which lean > "$status_dir/lean-path"
"$ELAN_HOME/bin/elan" which lake > "$status_dir/lake-path"
printf '%s\n' "$toolchain" > "$status_dir/toolchain"
if [ -n "$project_dir" ]; then
  checksum_files lean-toolchain lake-manifest.json lakefile.* > "$status_dir/environment.sha256"
fi
stage ready 'Lean setup passed. Return to Axiovela Math; the certificate panel updates automatically.'
printf '%s\n' 'This checks the tools and imports, not the correctness of your research proof.'
