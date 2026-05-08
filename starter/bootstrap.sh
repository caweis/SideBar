#!/usr/bin/env bash
# Sidebar bootstrap — deploys the planning starter, the field starter,
# or both, to your Cloudflare account.
#
# Run from this directory:    ./bootstrap.sh
# Requirements: node 18+, npm, a Cloudflare account.
#
# SAFETY: This script will refuse to deploy if a Pages project or D1
# database with the chosen name already exists on your account, and
# requires explicit y/N confirmation before any create/deploy step.
# `wrangler pages deploy --project-name X` silently overwrites an
# existing project X, so the collision check is the only thing
# protecting other deployments on the same account.

set -euo pipefail

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

sedi() {
  if sed --version >/dev/null 2>&1; then sed -i "$@"; else sed -i '' "$@"; fi
}

random_hex() {
  openssl rand -hex 2 2>/dev/null \
    || head -c 200 /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | head -c 4
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

DEFAULT_BASE="sidebar-demo-$(random_hex)"
read -rp "Project base name [${DEFAULT_BASE}]: " PROJECT_BASE
PROJECT_BASE="${PROJECT_BASE:-$DEFAULT_BASE}"
[[ "$PROJECT_BASE" =~ ^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$ ]] \
  || die "project name must be 1-32 chars, lowercase letters/numbers/hyphens, start+end with alphanumeric"

# ─── wrangler auth ──────────────────────────────────────────────────
say "Checking wrangler authentication…"
if ! npx --yes wrangler@^3.90.0 whoami >/dev/null 2>&1; then
  warn "wrangler not authenticated. Launching browser-based login…"
  npx --yes wrangler@^3.90.0 login
fi
ok "wrangler authenticated"

# ─── enumerate planned resources + collision check ──────────────────
declare -a PLANNED_PROJECTS=()
declare -a PLANNED_DBS=()

case "$APP_CHOICE" in
  planning)
    PLANNED_PROJECTS+=("${PROJECT_BASE}-planning")
    PLANNED_DBS+=("${PROJECT_BASE}-planning-db")
    ;;
  field)
    PLANNED_PROJECTS+=("${PROJECT_BASE}-field")
    PLANNED_DBS+=("${PROJECT_BASE}-field-db")
    ;;
  both)
    PLANNED_PROJECTS+=("${PROJECT_BASE}-planning" "${PROJECT_BASE}-field")
    PLANNED_DBS+=("${PROJECT_BASE}-planning-db" "${PROJECT_BASE}-field-db")
    ;;
esac

say "Pre-flight: checking your Cloudflare account for name collisions…"

# Cache the wrangler list outputs once.
PAGES_LIST="$(npx wrangler pages project list 2>/dev/null || true)"
D1_LIST="$(npx wrangler d1 list 2>/dev/null || true)"

# Word-boundary grep for the names. Imperfect — could false-positive
# on substrings — but errs on the side of refusing rather than overwriting.
collision_check() {
  local needle="$1"
  local haystack="$2"
  printf '%s' "$haystack" | grep -qE "(^|[^a-zA-Z0-9-])${needle}([^a-zA-Z0-9-]|$)"
}

COLLISIONS=()
for proj in "${PLANNED_PROJECTS[@]}"; do
  if collision_check "$proj" "$PAGES_LIST"; then
    COLLISIONS+=("Pages project '${proj}' already exists")
  fi
done
for db in "${PLANNED_DBS[@]}"; do
  if collision_check "$db" "$D1_LIST"; then
    COLLISIONS+=("D1 database '${db}' already exists")
  fi
done

if [ ${#COLLISIONS[@]} -gt 0 ]; then
  printf "\n${R}✗ Aborting — collisions detected on your Cloudflare account:${X}\n"
  for c in "${COLLISIONS[@]}"; do
    printf "    - %s\n" "$c"
  done
  printf "\n  Bootstrap will not deploy on top of existing resources.\n"
  printf "  Pick a different base name and re-run. The default suggestion\n"
  printf "  includes a random suffix specifically to avoid this.\n\n"
  exit 1
fi

ok "no collisions found"

# ─── confirmation ───────────────────────────────────────────────────
printf "\nAbout to create on your Cloudflare account:\n"
for i in "${!PLANNED_PROJECTS[@]}"; do
  printf "  • Pages project:  ${B}%s${X}\n" "${PLANNED_PROJECTS[$i]}"
  printf "  • D1 database:    ${B}%s${X}\n" "${PLANNED_DBS[$i]}"
done
printf "\n"

read -rp "Proceed? [y/N]: " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]([Ee][Ss])?$ ]] || die "aborted by user"

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
      [ -n "$db_id" ] || die "  could not parse database id from wrangler output:
${create_output}"
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

# Quick tour of what just got deployed · the planning starter ships with
# the five gamification mechanics from skills/gameify-the-convergence.md
# pre-wired so the date-vote section reads as "the game state is the UI"
# from first paint. New users get the pattern by example, not by docs.
if [ "$APP_CHOICE" != "field" ]; then
  cat <<EOF

${B}What's gameified out of the box (planning starter):${X}

  ${G}1${X} ${B}Show the score${X}      ▰▰▱▱▱  visible 5-segment progress bar
  ${G}2${X} ${B}Name the players${X}    voted + pending household lists
  ${G}3${X} ${B}Phase gates${X}         sequential chip strip with unlock targets
  ${G}4${X} ${B}Personal recognition${X} ✓ on the user's chosen card
  ${G}5${X} ${B}Actionable items only${X} locked axes don't render until they unlock

  See ${B}skills/gameify-the-convergence.md${X} for the full lens · copy
  the pattern to your other axes (cities, lodging, dinners, ...).

${B}Flight-search engines pre-wired (planning starter):${X}

  ${B}Awards${X}  seats.aero · point.me · AwardFares · PointsYeah
  ${B}Cash${X}    Google Flights · ITA Matrix · Skyscanner · Kayak · Going · Hopper

  All ten share one form (origin / via / dest / dates / pax / cabin) and
  one helper: ${B}buildFlightUrl(engine, params)${X} in
  ${B}site/flight-engines.js${X}. Six support pre-filled deep links;
  four (ITA, Going, Hopper, plus a Skyscanner multi-city corner case)
  land on the engine's form. Add your own engine in two lines: one
  switch case in ${B}buildFlightUrl${X}, one entry in ${B}ENGINES${X}.
EOF
fi

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

  4. Tune the gamification mechanics for your axes — see
     ../skills/gameify-the-convergence.md and the wired example in
     planning/site/index.html (search for "gamification primitives").

EOF
