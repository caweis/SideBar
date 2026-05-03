#!/usr/bin/env bash
# Sidebar bootstrap — deploys the planning starter, the field starter,
# or both, to your Cloudflare account.
#
# Run from this directory:    ./bootstrap.sh
# Requirements: node 18+, npm, a Cloudflare account.

set -euo pipefail

# Resolve to this script's directory regardless of where it's run from.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "$SCRIPT_DIR"

# ─── output helpers ─────────────────────────────────────────────────
if [ -t 1 ]; then
  B='\033[1m'; D='\033[2m'; G='\033[32m'; Y='\033[33m'; R='\033[31m'; X='\033[0m'
else
  B=''; D=''; G=''; Y=''; R=''; X=''
fi
say()  { printf "${B}▸${X} %s\n" "$*"; }
ok()   { printf "${G}✓${X} %s\n" "$*"; }
warn() { printf "${Y}!${X} %s\n" "$*"; }
die()  { printf "${R}✗${X} %s\n" "$*" >&2; exit 1; }

# Portable sed -i (handles BSD sed on macOS).
sedi() {
  if sed --version >/dev/null 2>&1; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

# ─── prereqs ────────────────────────────────────────────────────────
command -v node >/dev/null || die "node not found — install Node 18+ from https://nodejs.org"
command -v npm  >/dev/null || die "npm not found — comes with Node"

# ─── prompts ────────────────────────────────────────────────────────
printf "\n${B}Sidebar bootstrap${X}\n"
printf "${D}Deploys the planning starter, the field starter, or both, to your Cloudflare account.${X}\n\n"

read -rp "Which app(s) to deploy? [planning/field/both]: " APP_CHOICE
case "$APP_CHOICE" in
  planning|field|both) ;;
  *) die "expected one of: planning, field, both" ;;
esac

read -rp "Project base name (lowercase, hyphens ok, e.g. 'my-trip'): " PROJECT_BASE
[[ "$PROJECT_BASE" =~ ^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$ ]] \
  || die "project name must be 1-32 chars, lowercase letters/numbers/hyphens, start+end with alphanumeric"

# ─── wrangler auth ──────────────────────────────────────────────────
say "Checking wrangler authentication…"
if ! npx --yes wrangler@^3.90.0 whoami >/dev/null 2>&1; then
  warn "wrangler not authenticated. Launching browser-based login…"
  npx --yes wrangler@^3.90.0 login
fi
ok "wrangler authenticated"

# ─── deploy one app ─────────────────────────────────────────────────
deploy_one() {
  local subdir="$1"
  local suffix="$2"
  local project="${PROJECT_BASE}${suffix}"
  local db_name="${project}-db"

  printf "\n"
  say "Deploying ${B}${project}${X}…"

  (
    cd "$subdir"

    if [ ! -d node_modules ]; then
      say "  Installing wrangler…"
      npm install
    fi

    if [ ! -f wrangler.jsonc ]; then
      cp wrangler.jsonc.example wrangler.jsonc
      sedi "s/REPLACE_PROJECT_NAME/${project}/g" wrangler.jsonc
      rm -f wrangler.jsonc.bak
      ok "  wrote wrangler.jsonc"
    fi

    if grep -q 'REPLACE_DATABASE_ID' wrangler.jsonc; then
      say "  Creating D1 database '${db_name}'…"
      local create_output db_id
      create_output=$(npx wrangler d1 create "${db_name}" 2>&1 || true)
      db_id=$(echo "$create_output" \
        | grep -oE '[Dd]atabase[_ ]?[Ii]d[[:space:]]*[=:][[:space:]]*"[^"]+"' \
        | head -1 \
        | sed -E 's/.*"([^"]+)".*/\1/')
      [ -n "$db_id" ] || die "  could not parse database id from wrangler output:\n${create_output}"
      sedi "s/REPLACE_DATABASE_ID/${db_id}/g" wrangler.jsonc
      rm -f wrangler.jsonc.bak
      ok "  D1 ${db_name} → ${db_id}"
    else
      ok "  D1 already configured — skipping create"
    fi

    say "  Applying migrations to remote D1…"
    npx wrangler d1 migrations apply "${db_name}" --remote
    ok "  migrations applied"

    say "  Deploying to Cloudflare Pages…"
    npx wrangler pages deploy ./site --project-name "${project}"
    ok "  ${project} deployed"
  )
}

case "$APP_CHOICE" in
  planning) deploy_one planning -planning ;;
  field)    deploy_one field    -field ;;
  both)
    deploy_one planning -planning
    deploy_one field    -field
    ;;
esac

printf "\n"
ok "All done."
cat <<'EOF'

Next steps:

  1. Configure Cloudflare Access on each deployed URL:
       Cloudflare dashboard → Access → Applications → Add an Application
       (self-hosted) pointing at <project>.pages.dev. Attach a policy
       with the email(s) you want to grant access. Until Access is
       configured, the app sees every visitor as 'anonymous@local'
       (fine for local poking, not for shared use).

  2. (Optional) Add a custom domain in Pages → your-project → Custom
     domains.

  3. Read ../docs/METHOD.md and drop ../agents/sidebar-engineer.md
     into your .claude/agents/ directory for the agent persona.

EOF
