#!/bin/bash
set -euo pipefail

config="${CLAUDE_CONFIG_DIR:?}"
install_home="${CLAUDE_INSTALL_HOME:?}"
mkdir -p "$config/skills" "$install_home/.local"

# Claude updates itself under the running HOME, so ~/.local is the volume's.
ln -sfn "$install_home/.local" "$HOME/.local"

# The installer writes under HOME, so HOME points at the volume for this step.
if ! command -v claude >/dev/null 2>&1; then
  echo "Installing Claude into $install_home"
  curl -fsSL https://claude.ai/install.sh | HOME="$install_home" bash \
    || echo "Claude install failed. The board starts without it. Restart the container to retry." >&2
fi

if [ -n "${GH_TOKEN:-}" ]; then
  gh auth setup-git || echo "gh auth setup-git failed. Git cannot use GH_TOKEN." >&2

  name="${GIT_AUTHOR_NAME:-}"
  email="${GIT_AUTHOR_EMAIL:-}"
  if [ -z "$name" ] || [ -z "$email" ]; then
    IFS=$'\t' read -r gh_name gh_login gh_id < <(
      gh api user --jq '"\(.name // .login)\t\(.login)\t\(.id)"' 2>/dev/null
    ) || true
    name="${name:-${gh_name:-}}"
    [ -z "$email" ] && [ -n "${gh_id:-}" ] && email="${gh_id}+${gh_login}@users.noreply.github.com"
  fi
else
  name="${GIT_AUTHOR_NAME:-}"
  email="${GIT_AUTHOR_EMAIL:-}"
fi
[ -n "${name:-}" ] && git config --global user.name "$name"
[ -n "${email:-}" ] && git config --global user.email "$email"

# A first-run prompt in the Session terminal would catch a typed Delivery, so the seed marks it seen.
CONFIG_FILE="$config/.claude.json" node -e '
const fs = require("node:fs");
const file = process.env.CONFIG_FILE;
let current = {};
try { current = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
const seeded = { hasCompletedOnboarding: true, theme: "dark", ...current };
seeded.fullscreenUpsellSeenCount = Math.max(Number(current.fullscreenUpsellSeenCount) || 0, 99);
fs.writeFileSync(file, JSON.stringify(seeded, null, 2));
'

for skill in /app/skills/*/; do
  ln -sfn "${skill%/}" "$config/skills/$(basename "$skill")"
done

cd /app
exec node server/main.ts --no-open
