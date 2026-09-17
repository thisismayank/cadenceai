#!/usr/bin/env bash
set -eo pipefail

if [ -z "$CADENCEAI_REPO_URL" ]; then
  CADENCEAI_REPO_URL="https://github.com/thisismayank/cadenceai.git"
fi
if [ -z "$CADENCEAI_INSTALL_ROOT" ]; then
  CADENCEAI_INSTALL_ROOT="$HOME/.local/share/cadenceai"
fi
if [ -z "$CADENCEAI_BIN_DIR" ]; then
  CADENCEAI_BIN_DIR="$HOME/.local/bin"
fi

for dependency in git; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "CadenceAI installer requires $dependency on PATH." >&2
    exit 1
  fi
done

if command -v pnpm >/dev/null 2>&1; then
  PACKAGE_MANAGER=(pnpm)
elif command -v corepack >/dev/null 2>&1; then
  PACKAGE_MANAGER=(corepack pnpm)
else
  echo "CadenceAI installer requires pnpm or corepack on PATH." >&2
  exit 1
fi

if [ -d "$CADENCEAI_INSTALL_ROOT/.git" ]; then
  echo "Updating existing CadenceAI checkout…"
  git -C "$CADENCEAI_INSTALL_ROOT" pull --ff-only
elif [ -e "$CADENCEAI_INSTALL_ROOT" ]; then
  echo "Refusing to replace non-Git path: $CADENCEAI_INSTALL_ROOT" >&2
  exit 1
else
  echo "Installing CadenceAI into $CADENCEAI_INSTALL_ROOT…"
  mkdir -p "$(dirname "$CADENCEAI_INSTALL_ROOT")"
  git clone --depth 1 "$CADENCEAI_REPO_URL" "$CADENCEAI_INSTALL_ROOT"
fi

(
  cd "$CADENCEAI_INSTALL_ROOT"
  CI=true "${PACKAGE_MANAGER[@]}" install --frozen-lockfile
  CI=true "${PACKAGE_MANAGER[@]}" --filter @cadenceai/cli build
)

mkdir -p "$CADENCEAI_BIN_DIR"
CADENCEAI_EXECUTABLE="$CADENCEAI_INSTALL_ROOT/apps/cli/dist/index.js"

link_command() {
  target="$CADENCEAI_BIN_DIR/$1"
  if [ -e "$target" ] || [ -L "$target" ]; then
    existing="$(readlink "$target" 2>/dev/null || true)"
    if [ "$existing" != "$CADENCEAI_EXECUTABLE" ]; then
      echo "Refusing to replace existing command: $target" >&2
      exit 1
    fi
  else
    ln -s "$CADENCEAI_EXECUTABLE" "$target"
  fi
}

link_command cadenceai
link_command cadence

echo
echo "CadenceAI installed."
case ":$PATH:" in
  *":$CADENCEAI_BIN_DIR:"*)
    echo "Run:"
    echo "  cadenceai setup"
    echo "  cadenceai doctor"
    ;;
  *)
    echo "Add the command directory to PATH for this shell:"
    echo "  export PATH=\"$CADENCEAI_BIN_DIR:\$PATH\""
    echo "Then run:"
    echo "  $CADENCEAI_BIN_DIR/cadenceai setup"
    echo "  $CADENCEAI_BIN_DIR/cadenceai doctor"
    ;;
esac
