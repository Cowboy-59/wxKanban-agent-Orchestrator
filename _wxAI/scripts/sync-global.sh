#!/bin/bash
set -euo pipefail

# sync-global.sh - Compare ~/.claude with starter kit's _claude-global
# Also handles wxKanban governance rules version checking (Spec 015)
# WHITELIST APPROACH: Only compare specific folders/files we care about
# Exit codes: 0 = has changes, 1 = error, 2 = no changes needed

GLOBAL_DIR="$HOME/.claude"
CONFIG_FILE="$GLOBAL_DIR/starter-kit-config.json"
WXKANBAN_VERSION_FILE=".wxkanban-version"
WXKANBAN_ORIGIN_FILE=".wxkanban-origin"

# WHITELIST: Only these locations are compared
WATCHED_DIRS=("hooks" "skills" "commands" "scripts")
WATCHED_FILES=("settings.json" "statusline.sh")

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

error() { echo -e "${RED}ERROR: $1${NC}" >&2; exit 1; }
warn() { echo -e "${YELLOW}$1${NC}"; }
info() { echo -e "${BLUE}$1${NC}"; }
success() { echo -e "${GREEN}$1${NC}"; }

# Cross-platform file hash (works on Mac, Linux, Windows/Git Bash)
get_file_hash() {
    local file="$1"
    if command -v md5sum &>/dev/null; then
        md5sum "$file" | cut -d' ' -f1
    elif command -v md5 &>/dev/null; then
        get_file_hash "$file"
    else
        shasum -a 256 "$file" | cut -d' ' -f1
    fi
}

# Detect if we're in starter kit (has .claude/master.txt)
detect_kit_path() {
    if [[ -f "$PWD/.claude/master.txt" ]]; then
        echo "$PWD"
        return 0
    fi
    if [[ -f "$CONFIG_FILE" ]]; then
        local path
        path=$(grep -o '"starterKitPath"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | cut -d'"' -f4)
        if [[ -n "$path" && -d "$path" ]]; then
            echo "$path"
            return 0
        fi
    fi
    return 1
}

detect_mode() {
    [[ -f "$PWD/.claude/master.txt" ]] && echo "MASTER" || echo "CONSUMER"
}

# Update config (master mode)
update_config() {
    local kit_path="$1"
    mkdir -p "$(dirname "$CONFIG_FILE")"
    cat > "$CONFIG_FILE" << EOF
{
  "starterKitPath": "$kit_path",
  "lastConfigured": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    info "Updated starter-kit-config.json"
}

# Compare files in whitelist only
compare_files() {
    local kit_dir="$1"
    local mode="$2"
    local kit_base="$kit_dir/_claude-global"

    [[ -d "$kit_base" ]] || error "Starter kit _claude-global not found: $kit_base"

    local identical=0 differs=0 missing_global=0 only_global=0
    declare -a differs_files=() missing_files=() only_global_files=()

    echo "=========================================="
    echo "SYNC ANALYSIS: $mode MODE"
    echo "=========================================="
    echo ""
    echo "Kit:    $kit_base"
    echo "Global: $GLOBAL_DIR"
    echo ""
    echo "Watched: ${WATCHED_DIRS[*]} + ${WATCHED_FILES[*]}"
    echo ""

    # Compare watched directories
    for dir in "${WATCHED_DIRS[@]}"; do
        local kit_dir_path="$kit_base/$dir"
        local global_dir_path="$GLOBAL_DIR/$dir"

        [[ -d "$kit_dir_path" ]] || continue

        while IFS= read -r -d '' file; do
            local rel_path="${file#$kit_base/}"
            local global_file="$GLOBAL_DIR/$rel_path"

            if [[ -f "$global_file" ]]; then
                local kit_hash global_hash
                kit_hash=$(get_file_hash "$file")
                global_hash=$(get_file_hash "$global_file")
                if [[ "$kit_hash" == "$global_hash" ]]; then
                    ((identical++))
                else
                    ((differs++))
                    differs_files+=("$rel_path")
                fi
            else
                ((missing_global++))
                missing_files+=("$rel_path")
            fi
        done < <(find "$kit_dir_path" -type f ! -name ".DS_Store" -print0 2>/dev/null)

        # Check for files only in global (not in kit)
        [[ -d "$global_dir_path" ]] || continue
        while IFS= read -r -d '' file; do
            local rel_path="${file#$GLOBAL_DIR/}"
            local kit_file="$kit_base/$rel_path"
            if [[ ! -f "$kit_file" ]]; then
                ((only_global++))
                only_global_files+=("$rel_path")
            fi
        done < <(find "$global_dir_path" -type f ! -name ".DS_Store" -print0 2>/dev/null)
    done

    # Compare watched root files
    for file in "${WATCHED_FILES[@]}"; do
        local kit_file="$kit_base/$file"
        local global_file="$GLOBAL_DIR/$file"

        [[ -f "$kit_file" ]] || continue

        if [[ -f "$global_file" ]]; then
            local kit_hash global_hash
            kit_hash=$(get_file_hash "$kit_file")
            global_hash=$(get_file_hash "$global_file")
            if [[ "$kit_hash" == "$global_hash" ]]; then
                ((identical++))
            else
                ((differs++))
                differs_files+=("$file")
            fi
        else
            ((missing_global++))
            missing_files+=("$file")
        fi
    done

    # Summary
    echo "--- SUMMARY ---"
    success "Identical:         $identical files"
    [[ $differs -gt 0 ]] && warn "Different:         $differs files" || echo "Different:         $differs files"
    [[ $missing_global -gt 0 ]] && warn "Missing in global: $missing_global files" || echo "Missing in global: $missing_global files"
    [[ $only_global -gt 0 ]] && info "Only in global:    $only_global files" || echo "Only in global:    $only_global files"
    echo ""

    # Details
    if [[ ${#differs_files[@]} -gt 0 ]]; then
        echo "--- DIFFERS ---"
        printf '  %s\n' "${differs_files[@]}"
        echo ""
    fi

    if [[ ${#missing_files[@]} -gt 0 ]]; then
        echo "--- MISSING IN GLOBAL ---"
        printf '  %s\n' "${missing_files[@]}"
        echo ""
    fi

    if [[ ${#only_global_files[@]} -gt 0 ]]; then
        echo "--- ONLY IN GLOBAL ---"
        printf '  %s\n' "${only_global_files[@]}"
        echo ""
    fi

    if [[ $differs -eq 0 && $missing_global -eq 0 ]]; then
        success "All synced. No changes needed."
        return 2
    fi
    return 0
}

cpl_version_hint() {
    local kit_path="$1"
    local cpl_version_file="$kit_path/_cpl/VERSION"
    local installed_version_file="$HOME/.cpl-version"

    [[ -f "$cpl_version_file" ]] || return 0

    local repo_version installed_version
    repo_version=$(tr -d '[:space:]' < "$cpl_version_file")

    if [[ -f "$installed_version_file" ]]; then
        installed_version=$(tr -d '[:space:]' < "$installed_version_file")
        if [[ "$repo_version" != "$installed_version" ]]; then
            echo ""
            warn "CPL: v${installed_version} installed, v${repo_version} available. Run /sync-cpl to update."
        fi
    else
        echo ""
        warn "CPL: not installed. v${repo_version} available. Run /sync-cpl to install."
    fi
}

# ── wxKanban Governance Version Check (Spec 015) ─────────────────────────────

# Parse semver major version
get_major_version() {
    echo "$1" | cut -d'.' -f1
}

# Check wxKanban governance rules version status
check_wxkanban_version() {
    local mode="$1"

    # Only check in consumer projects (no .wxkanban-origin)
    if [[ -f "$WXKANBAN_ORIGIN_FILE" ]]; then
        info "wxKanban: SOURCE project detected — governance rules are authoritative here."
        return 0
    fi

    if [[ ! -f "$WXKANBAN_VERSION_FILE" ]]; then
        warn "wxKanban: .wxkanban-version not found — governance rules may not be installed."
        warn "         Run: wxai sync-global --apply to install governance rules."
        return 0
    fi

    # Read consumer version
    local consumer_version
    consumer_version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$WXKANBAN_VERSION_FILE" | head -1 | cut -d'"' -f4)

    if [[ -z "$consumer_version" ]]; then
        warn "wxKanban: Could not read version from .wxkanban-version"
        return 0
    fi

    # Read source version (from kit path if available)
    local source_version=""
    local kit_path
    if kit_path=$(detect_kit_path 2>/dev/null); then
        local origin_file="$kit_path/$WXKANBAN_ORIGIN_FILE"
        if [[ -f "$origin_file" ]]; then
            source_version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$origin_file" | head -1 | cut -d'"' -f4)
        fi
    fi

    if [[ -z "$source_version" ]]; then
        info "wxKanban: Governance rules v${consumer_version} installed. (Source version unavailable for comparison)"
        return 0
    fi

    local consumer_major source_major
    consumer_major=$(get_major_version "$consumer_version")
    source_major=$(get_major_version "$source_version")
    local version_diff=$(( source_major - consumer_major ))

    echo ""
    echo "--- wxKanban GOVERNANCE RULES ---"

    if [[ "$consumer_version" == "$source_version" ]]; then
        success "Governance rules: v${consumer_version} ✅ Up to date"
    elif [[ $version_diff -ge 2 ]]; then
        echo ""
        echo -e "${RED}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║  ⛔ GOVERNANCE RULES CRITICALLY OUT OF DATE — IMPLEMENTATION BLOCKED        ║${NC}"
        echo -e "${RED}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
        warn "Consumer: v${consumer_version}  |  Source: v${source_version}  |  ${version_diff} major version(s) behind"
        warn ""
        warn "AI implementation is BLOCKED until governance rules are updated."
        warn "Run: wxai sync-global --apply"
        echo ""
    elif [[ $version_diff -eq 1 ]]; then
        warn "Governance rules: v${consumer_version} ⚠️  1 major version behind (v${source_version} available)"
        warn "Run: wxai sync-global --apply to update"
    elif [[ $version_diff -gt 0 ]]; then
        warn "Governance rules: v${consumer_version} ⚠️  Minor update available (v${source_version})"
        info "Run: wxai sync-global --apply to update"
    fi

    echo ""
    return 0
}

# Apply governance rules update from source to consumer
apply_wxkanban_update() {
    local kit_path="$1"

    if [[ -f "$WXKANBAN_ORIGIN_FILE" ]]; then
        error "Cannot apply updates in SOURCE project. Use --push to distribute changes."
    fi

    local source_wxai="$kit_path/_wxAI"
    if [[ ! -d "$source_wxai" ]]; then
        error "Source _wxAI directory not found at: $source_wxai"
    fi

    info "Applying wxKanban governance rules update..."

    local managed_files=(
        "_wxAI/rules/constitution.md"
        "_wxAI/commands/wxAI-implement.md"
        "_wxAI/commands/wxAI-scope-check.md"
        "_wxAI/commands/wxAI-training.md"
        "_wxAI/commands/wxAI-todo-import.md"
        "_wxAI/commands/wxAI-sync-global.md"
        "_wxAI/commands/wxAI-session-start.md"
    )

    local updated=0 skipped=0

    for file in "${managed_files[@]}"; do
        local source_file="$kit_path/$file"
        local dest_file="$PWD/$file"

        if [[ ! -f "$source_file" ]]; then
            warn "  SKIP: $file (not found in source)"
            ((skipped++))
            continue
        fi

        mkdir -p "$(dirname "$dest_file")"
        cp "$source_file" "$dest_file"
        success "  ✅ $file"
        ((updated++))
    done

    # Update .wxkanban-version
    local new_version
    new_version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$kit_path/$WXKANBAN_ORIGIN_FILE" | head -1 | cut -d'"' -f4)
    local timestamp
    timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    if [[ -n "$new_version" && -f "$WXKANBAN_VERSION_FILE" ]]; then
        # Update version field in .wxkanban-version
        sed -i.bak "s/\"version\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"version\": \"$new_version\"/" "$WXKANBAN_VERSION_FILE"
        sed -i.bak "s/\"last_sync\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"last_sync\": \"$timestamp\"/" "$WXKANBAN_VERSION_FILE"
        rm -f "${WXKANBAN_VERSION_FILE}.bak"
        success "  ✅ .wxkanban-version updated to v${new_version}"
    fi

    echo ""
    success "Governance rules updated: ${updated} file(s) updated, ${skipped} skipped."
    info "Log this sync: POST /api/ai-audit/log { actiontype: 'rules_sync', ... }"
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
    local kit_path
    kit_path=$(detect_kit_path) || error "Cannot find starter kit. Run from starter kit directory or configure path first."

    local mode
    mode=$(detect_mode)

    [[ "$mode" == "MASTER" ]] && update_config "$kit_path"

    # Handle wxKanban-specific flags
    for arg in "$@"; do
        case "$arg" in
            --check)
                check_wxkanban_version "$mode"
                return 0
                ;;
            --apply)
                apply_wxkanban_update "$kit_path"
                return 0
                ;;
            --version)
                if [[ -f "$WXKANBAN_VERSION_FILE" ]]; then
                    local ver
                    ver=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$WXKANBAN_VERSION_FILE" | head -1 | cut -d'"' -f4)
                    info "wxKanban governance rules version: ${ver}"
                else
                    warn "No .wxkanban-version file found"
                fi
                return 0
                ;;
        esac
    done

    # Default: run standard sync comparison + version check
    compare_files "$kit_path" "$mode"
    local compare_exit=$?

    # Also run governance version check
    check_wxkanban_version "$mode"

    cpl_version_hint "$kit_path"

    return $compare_exit
}

main "$@"
