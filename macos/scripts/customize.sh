#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: customize.sh [options]

Options:
  --image <path>          Import PNG/JPEG/WebP background and set it active.
  --name <name>           Active theme name.
  --appearance <value>    auto, light, or dark.
  --accent <hex>          Accent color, for example #7cc7ff.
  --secondary <hex>       Secondary color.
  --highlight <hex>       Highlight color.
  --surface <css-color>   Surface color, for example 'rgba(10, 15, 18, 0.46)'.
  --surface-strong <css>  Strong surface color, for example 'rgba(10, 15, 18, 0.64)'.
  --mode <value>          chrome-only, sidebar-art, or wallpaper.
  --sidebar-accent <hex>  Sidebar module accent color.
  --sidebar-surface <css>
  --sidebar-border <css>
  --header-accent <hex>   Header/titlebar module accent color.
  --header-surface <css>
  --header-border <css>
  --composer-accent <hex> Composer module accent color.
  --composer-surface <css>
  --composer-border <css>
  --popover-accent <hex>  Popover/menu module accent color.
  --popover-surface <css>
  --popover-border <css>
  --mecha-armor <hex>     Mecha armor accent color.
  --mecha-glow <hex>      Mecha glow accent color.
  --status-success <hex>  Success/status pass color.
  --status-warning <hex>  Warning/status attention color.
  --status-danger <hex>   Error/status danger color.
  --status-info <hex>     Informational/status color.
  --icon-badge-enabled <bool>
  --icon-badge-path <path>
  --icon-badge-size <px>
  --character-enabled <bool>
  --character-path <path>
  --character-placement <sidebar-hero|right-bottom|off>
  --character-size <px>
  --character-opacity <0..1>
  --table-flip-cat-enabled <bool>
  --table-flip-cat-path <path>
  --table-flip-cat-sprite-path <path>
  --table-flip-cat-poster-path <path>
  --table-flip-cat-trigger-icon-path <path>
  --table-flip-cat-placement <right-bottom|off>
  --table-flip-cat-size <px>
  --table-flip-cat-opacity <0..1>
  --table-flip-cat-frame-count <count>
  --table-flip-cat-duration-ms <ms>
  --icon-buttons-enabled <bool>
  --icon-buttons-apply-mode <opt-in|module|off>
  --icon-buttons-sidebar-navigation-enabled <bool>
  --icon-buttons-titlebar-navigation-enabled <bool>
  --icon-buttons-composer-controls-enabled <bool>
  --icon-buttons-top-utility-actions-enabled <bool>
  --icon-buttons-message-actions-enabled <bool>
  --icon-buttons-project-panel-rows-enabled <bool>
  --focus-x <0..1>        Background focus X.
  --focus-y <0..1>        Background focus Y.
  --safe-area <value>     auto, left, right, center, none, or sides.
  --task-mode <value>     auto, ambient, banner, or off.
  --reset                 Reset to bundled default theme.
  --show                  Print active theme JSON.
  -h, --help              Show help.
EOF
}

MODE="set"
ARGS=(--state-dir "$CIT_STATE_DIR" --assets-dir "$CIT_ROOT_DIR/assets")

while [ "$#" -gt 0 ]; do
  case "$1" in
    --image)
      [ "$#" -ge 2 ] || cit_die "--image requires a value"
      ARGS+=(--image "$2")
      shift 2
      ;;
    --name)
      [ "$#" -ge 2 ] || cit_die "--name requires a value"
      ARGS+=(--name "$2")
      shift 2
      ;;
    --appearance)
      [ "$#" -ge 2 ] || cit_die "--appearance requires a value"
      ARGS+=(--appearance "$2")
      shift 2
      ;;
    --accent)
      [ "$#" -ge 2 ] || cit_die "--accent requires a value"
      ARGS+=(--accent "$2")
      shift 2
      ;;
    --secondary)
      [ "$#" -ge 2 ] || cit_die "--secondary requires a value"
      ARGS+=(--secondary "$2")
      shift 2
      ;;
    --highlight)
      [ "$#" -ge 2 ] || cit_die "--highlight requires a value"
      ARGS+=(--highlight "$2")
      shift 2
      ;;
    --surface)
      [ "$#" -ge 2 ] || cit_die "--surface requires a value"
      ARGS+=(--surface "$2")
      shift 2
      ;;
    --surface-strong)
      [ "$#" -ge 2 ] || cit_die "--surface-strong requires a value"
      ARGS+=(--surface-strong "$2")
      shift 2
      ;;
    --mode)
      [ "$#" -ge 2 ] || cit_die "--mode requires a value"
      ARGS+=(--mode "$2")
      shift 2
      ;;
    --sidebar-accent)
      [ "$#" -ge 2 ] || cit_die "--sidebar-accent requires a value"
      ARGS+=(--sidebar-accent "$2")
      shift 2
      ;;
    --sidebar-surface)
      [ "$#" -ge 2 ] || cit_die "--sidebar-surface requires a value"
      ARGS+=(--sidebar-surface "$2")
      shift 2
      ;;
    --sidebar-border)
      [ "$#" -ge 2 ] || cit_die "--sidebar-border requires a value"
      ARGS+=(--sidebar-border "$2")
      shift 2
      ;;
    --header-accent)
      [ "$#" -ge 2 ] || cit_die "--header-accent requires a value"
      ARGS+=(--header-accent "$2")
      shift 2
      ;;
    --header-surface)
      [ "$#" -ge 2 ] || cit_die "--header-surface requires a value"
      ARGS+=(--header-surface "$2")
      shift 2
      ;;
    --header-border)
      [ "$#" -ge 2 ] || cit_die "--header-border requires a value"
      ARGS+=(--header-border "$2")
      shift 2
      ;;
    --composer-accent)
      [ "$#" -ge 2 ] || cit_die "--composer-accent requires a value"
      ARGS+=(--composer-accent "$2")
      shift 2
      ;;
    --composer-surface)
      [ "$#" -ge 2 ] || cit_die "--composer-surface requires a value"
      ARGS+=(--composer-surface "$2")
      shift 2
      ;;
    --composer-border)
      [ "$#" -ge 2 ] || cit_die "--composer-border requires a value"
      ARGS+=(--composer-border "$2")
      shift 2
      ;;
    --popover-accent)
      [ "$#" -ge 2 ] || cit_die "--popover-accent requires a value"
      ARGS+=(--popover-accent "$2")
      shift 2
      ;;
    --popover-surface)
      [ "$#" -ge 2 ] || cit_die "--popover-surface requires a value"
      ARGS+=(--popover-surface "$2")
      shift 2
      ;;
    --popover-border)
      [ "$#" -ge 2 ] || cit_die "--popover-border requires a value"
      ARGS+=(--popover-border "$2")
      shift 2
      ;;
    --mecha-armor)
      [ "$#" -ge 2 ] || cit_die "--mecha-armor requires a value"
      ARGS+=(--mecha-armor "$2")
      shift 2
      ;;
    --mecha-glow)
      [ "$#" -ge 2 ] || cit_die "--mecha-glow requires a value"
      ARGS+=(--mecha-glow "$2")
      shift 2
      ;;
    --status-success)
      [ "$#" -ge 2 ] || cit_die "--status-success requires a value"
      ARGS+=(--status-success "$2")
      shift 2
      ;;
    --status-warning)
      [ "$#" -ge 2 ] || cit_die "--status-warning requires a value"
      ARGS+=(--status-warning "$2")
      shift 2
      ;;
    --status-danger)
      [ "$#" -ge 2 ] || cit_die "--status-danger requires a value"
      ARGS+=(--status-danger "$2")
      shift 2
      ;;
    --status-info)
      [ "$#" -ge 2 ] || cit_die "--status-info requires a value"
      ARGS+=(--status-info "$2")
      shift 2
      ;;
    --icon-badge-enabled)
      [ "$#" -ge 2 ] || cit_die "--icon-badge-enabled requires a value"
      ARGS+=(--icon-badge-enabled "$2")
      shift 2
      ;;
    --icon-badge-path)
      [ "$#" -ge 2 ] || cit_die "--icon-badge-path requires a value"
      ARGS+=(--icon-badge-path "$2")
      shift 2
      ;;
    --icon-badge-size)
      [ "$#" -ge 2 ] || cit_die "--icon-badge-size requires a value"
      ARGS+=(--icon-badge-size "$2")
      shift 2
      ;;
    --character-enabled)
      [ "$#" -ge 2 ] || cit_die "--character-enabled requires a value"
      ARGS+=(--character-enabled "$2")
      shift 2
      ;;
    --character-path)
      [ "$#" -ge 2 ] || cit_die "--character-path requires a value"
      ARGS+=(--character-path "$2")
      shift 2
      ;;
    --character-placement)
      [ "$#" -ge 2 ] || cit_die "--character-placement requires a value"
      ARGS+=(--character-placement "$2")
      shift 2
      ;;
    --character-size)
      [ "$#" -ge 2 ] || cit_die "--character-size requires a value"
      ARGS+=(--character-size "$2")
      shift 2
      ;;
    --character-opacity)
      [ "$#" -ge 2 ] || cit_die "--character-opacity requires a value"
      ARGS+=(--character-opacity "$2")
      shift 2
      ;;
    --table-flip-cat-enabled)
      [ "$#" -ge 2 ] || cit_die "--table-flip-cat-enabled requires a value"
      ARGS+=(--table-flip-cat-enabled "$2")
      shift 2
      ;;
    --table-flip-cat-path)
      [ "$#" -ge 2 ] || cit_die "--table-flip-cat-path requires a value"
      ARGS+=(--table-flip-cat-path "$2")
      shift 2
      ;;
    --table-flip-cat-sprite-path)
      [ "$#" -ge 2 ] || cit_die "--table-flip-cat-sprite-path requires a value"
      ARGS+=(--table-flip-cat-sprite-path "$2")
      shift 2
      ;;
    --table-flip-cat-poster-path)
      [ "$#" -ge 2 ] || cit_die "--table-flip-cat-poster-path requires a value"
      ARGS+=(--table-flip-cat-poster-path "$2")
      shift 2
      ;;
    --table-flip-cat-trigger-icon-path)
      [ "$#" -ge 2 ] || cit_die "--table-flip-cat-trigger-icon-path requires a value"
      ARGS+=(--table-flip-cat-trigger-icon-path "$2")
      shift 2
      ;;
    --table-flip-cat-placement)
      [ "$#" -ge 2 ] || cit_die "--table-flip-cat-placement requires a value"
      ARGS+=(--table-flip-cat-placement "$2")
      shift 2
      ;;
    --table-flip-cat-size)
      [ "$#" -ge 2 ] || cit_die "--table-flip-cat-size requires a value"
      ARGS+=(--table-flip-cat-size "$2")
      shift 2
      ;;
    --table-flip-cat-opacity)
      [ "$#" -ge 2 ] || cit_die "--table-flip-cat-opacity requires a value"
      ARGS+=(--table-flip-cat-opacity "$2")
      shift 2
      ;;
    --table-flip-cat-frame-count)
      [ "$#" -ge 2 ] || cit_die "--table-flip-cat-frame-count requires a value"
      ARGS+=(--table-flip-cat-frame-count "$2")
      shift 2
      ;;
    --table-flip-cat-duration-ms)
      [ "$#" -ge 2 ] || cit_die "--table-flip-cat-duration-ms requires a value"
      ARGS+=(--table-flip-cat-duration-ms "$2")
      shift 2
      ;;
    --icon-buttons-enabled)
      [ "$#" -ge 2 ] || cit_die "--icon-buttons-enabled requires a value"
      ARGS+=(--icon-buttons-enabled "$2")
      shift 2
      ;;
    --icon-buttons-apply-mode)
      [ "$#" -ge 2 ] || cit_die "--icon-buttons-apply-mode requires a value"
      ARGS+=(--icon-buttons-apply-mode "$2")
      shift 2
      ;;
    --icon-buttons-sidebar-navigation-enabled)
      [ "$#" -ge 2 ] || cit_die "--icon-buttons-sidebar-navigation-enabled requires a value"
      ARGS+=(--icon-buttons-sidebar-navigation-enabled "$2")
      shift 2
      ;;
    --icon-buttons-titlebar-navigation-enabled)
      [ "$#" -ge 2 ] || cit_die "--icon-buttons-titlebar-navigation-enabled requires a value"
      ARGS+=(--icon-buttons-titlebar-navigation-enabled "$2")
      shift 2
      ;;
    --icon-buttons-composer-controls-enabled)
      [ "$#" -ge 2 ] || cit_die "--icon-buttons-composer-controls-enabled requires a value"
      ARGS+=(--icon-buttons-composer-controls-enabled "$2")
      shift 2
      ;;
    --icon-buttons-top-utility-actions-enabled)
      [ "$#" -ge 2 ] || cit_die "--icon-buttons-top-utility-actions-enabled requires a value"
      ARGS+=(--icon-buttons-top-utility-actions-enabled "$2")
      shift 2
      ;;
    --icon-buttons-message-actions-enabled)
      [ "$#" -ge 2 ] || cit_die "--icon-buttons-message-actions-enabled requires a value"
      ARGS+=(--icon-buttons-message-actions-enabled "$2")
      shift 2
      ;;
    --icon-buttons-project-panel-rows-enabled)
      [ "$#" -ge 2 ] || cit_die "--icon-buttons-project-panel-rows-enabled requires a value"
      ARGS+=(--icon-buttons-project-panel-rows-enabled "$2")
      shift 2
      ;;
    --focus-x)
      [ "$#" -ge 2 ] || cit_die "--focus-x requires a value"
      ARGS+=(--focus-x "$2")
      shift 2
      ;;
    --focus-y)
      [ "$#" -ge 2 ] || cit_die "--focus-y requires a value"
      ARGS+=(--focus-y "$2")
      shift 2
      ;;
    --safe-area)
      [ "$#" -ge 2 ] || cit_die "--safe-area requires a value"
      ARGS+=(--safe-area "$2")
      shift 2
      ;;
    --task-mode)
      [ "$#" -ge 2 ] || cit_die "--task-mode requires a value"
      ARGS+=(--task-mode "$2")
      shift 2
      ;;
    --reset)
      MODE="reset"
      shift
      ;;
    --show)
      MODE="show"
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown customize option: $1"
      ;;
  esac
done

cit_assert_source_layout
APP_PATH="$(cit_detect_app_or_die)"
NODE_PATH="$(cit_node_for_app "$APP_PATH")"
cit_ensure_state_dirs

case "$MODE" in
  reset)
    "$NODE_PATH" "$CIT_ROOT_DIR/scripts/theme-store.mjs" reset "${ARGS[@]}"
    ;;
  show)
    "$NODE_PATH" "$CIT_ROOT_DIR/scripts/theme-store.mjs" show "${ARGS[@]}"
    ;;
  set)
    "$NODE_PATH" "$CIT_ROOT_DIR/scripts/theme-store.mjs" set-image "${ARGS[@]}"
    ;;
  *)
    cit_die "invalid mode: $MODE"
    ;;
esac
