#!/usr/bin/env bash
set -euo pipefail

# 从 upgrade-from-zip.sh / upgrade.sh 生成的 .upgrade-backup/<时间戳>/ 还原运行数据。
# 只还原备份里有的内容（config.yaml、data.tgz 等），不会回退源码。

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BINARY_NAME="cyberstrike-ai"
CONFIG_FILE="$ROOT_DIR/config.yaml"
BACKUP_ROOT="$ROOT_DIR/.upgrade-backup"

BACKUP_ID=""
LIST_ONLY=0
STOP_SERVICE=1
FORCE_STOP=0
RESTART=1
YES=0
RESTORE_CONFIG=1
RESTORE_DATA=1
RESTORE_KNOWLEDGE=1
RESTORE_TOOLS=1
RESTORE_VENV=0
RUN_ARGS=()

usage() {
  cat <<EOF
用法:
  ./restore-from-backup.sh [--backup <时间戳或目录>] [--yes]
  ./restore-from-backup.sh --list

说明:
  升级脚本会把 config.yaml、data/ 备份到:
    ${BACKUP_ROOT}/<YYYYMMDD_HHMMSS>/
  本脚本从其中一次备份还原「运行数据」，不回退已经更新的源码。
  未指定 --backup 时，使用最新一次备份。

选项:
  --backup <id>        备份时间戳（如 20260901_120000）或该目录的完整路径
  --list               只列出可用备份，不还原
  --yes                不交互确认
  --config-only        只还原 config.yaml
  --data-only          只还原 data/
  --venv               若备份里有 venv.tgz 则一并还原
  --no-stop            不停正在运行的服务
  --force-stop         当前目录匹配不到进程时，也停止其它 cyberstrike-ai
  --no-restart         还原后不执行 ./run.sh
  --http / --https     传给 run.sh（重启时）
  -h, --help           显示帮助

示例:
  ./restore-from-backup.sh --list
  ./restore-from-backup.sh --yes
  ./restore-from-backup.sh --backup 20260901_120000 --yes
  ./restore-from-backup.sh --data-only --yes
EOF
}

log() { printf "%s\n" "$*"; }
info() { log "[INFO]  $*"; }
warn() { log "[WARN]  $*"; }
err() { log "[ERROR] $*"; }

have_cmd() { command -v "$1" >/dev/null 2>&1; }

print_banner() {
  cat <<EOF

==========================================
  从升级备份还原运行数据
==========================================
说明:
  还原对象是升级前备份的配置和数据，不是把代码退回旧版本。
  还原前会先把当前 config.yaml / data/ 再备份一份到:
    ${BACKUP_ROOT}/pre-restore-<时间戳>/
  避免还原后无法回到「还原前」状态。

EOF
}

print_step() {
  echo ""
  log "---------- $1 ----------"
}

list_backups() {
  if [[ ! -d "$BACKUP_ROOT" ]]; then
    warn "还没有备份目录: ${BACKUP_ROOT}"
    info "请先成功跑过一次 ./upgrade-from-zip.sh，才会生成备份。"
    return 1
  fi

  local found=0
  local dir id
  local glob_nullglob
  glob_nullglob="$(shopt -p nullglob || true)"
  shopt -s nullglob
  echo ""
  log "可用备份（新 → 旧）:"
  while IFS= read -r dir; do
    [[ -z "$dir" ]] && continue
    found=1
    id="$(basename "$dir")"
    printf "  %s\n" "$id"
    [[ -f "${dir}/config.yaml" ]] && printf "      - config.yaml\n"
    [[ -f "${dir}/data.tgz" ]] && printf "      - data.tgz\n"
    [[ -f "${dir}/knowledge_base.tgz" ]] && printf "      - knowledge_base.tgz\n"
    [[ -f "${dir}/tools.tgz" ]] && printf "      - tools.tgz\n"
    [[ -f "${dir}/roles.tgz" ]] && printf "      - roles.tgz\n"
    [[ -f "${dir}/skills.tgz" ]] && printf "      - skills.tgz\n"
    [[ -f "${dir}/venv.tgz" ]] && printf "      - venv.tgz\n"
  done < <(printf '%s\n' "$BACKUP_ROOT"/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_[0-9][0-9][0-9][0-9][0-9][0-9] | sort -r)
  eval "$glob_nullglob"

  if [[ "$found" -eq 0 ]]; then
    warn "未找到形如 YYYYMMDD_HHMMSS 的备份目录。"
    info "请检查: ${BACKUP_ROOT}"
    return 1
  fi
  echo ""
  return 0
}

resolve_backup_dir() {
  local raw="$1"
  if [[ -d "$raw" ]]; then
    (cd "$raw" && pwd)
    return 0
  fi
  if [[ -d "${BACKUP_ROOT}/${raw}" ]]; then
    printf '%s\n' "${BACKUP_ROOT}/${raw}"
    return 0
  fi
  return 1
}

latest_backup_id() {
  local glob_nullglob path
  glob_nullglob="$(shopt -p nullglob || true)"
  shopt -s nullglob
  path="$(printf '%s\n' "$BACKUP_ROOT"/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_[0-9][0-9][0-9][0-9][0-9][0-9] | sort -r | head -n 1 || true)"
  eval "$glob_nullglob"
  if [[ -n "$path" && -d "$path" ]]; then
    basename "$path"
  fi
}

stop_service() {
  print_step "步骤 2/4  停止正在运行的服务"
  if [[ "$STOP_SERVICE" -ne 1 ]]; then
    info "已跳过（--no-stop）。数据库文件若仍被占用，还原可能失败。"
    return 0
  fi

  info "查找当前目录下的 ${BINARY_NAME} 进程..."
  local pids=""
  if have_cmd pgrep; then
    pids="$(pgrep -f "${ROOT_DIR}.*${BINARY_NAME}" || true)"
    if [[ -z "$pids" && "$FORCE_STOP" -eq 1 ]]; then
      warn "当前目录未找到进程，已加 --force-stop，将尝试停止本机所有 ${BINARY_NAME}。"
      pids="$(pgrep -f "${BINARY_NAME}" || true)"
    fi
  else
    warn "系统没有 pgrep，无法自动停服务。请确认已手动停止后再继续。"
    return 0
  fi

  if [[ -z "$pids" ]]; then
    info "未检测到运行中的服务，无需停止。"
    return 0
  fi

  warn "将停止以下 PID（最多等待 20 秒）: ${pids}"
  local pid
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      info "向 PID=${pid} 发送 SIGTERM..."
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done

  local deadline=$((SECONDS + 20))
  while [[ $SECONDS -lt $deadline ]]; do
    local alive=0
    for pid in $pids; do
      if kill -0 "$pid" 2>/dev/null; then
        alive=1
        break
      fi
    done
    if [[ "$alive" -eq 0 ]]; then
      info "服务已停止，可以还原文件。"
      return 0
    fi
    sleep 1
  done

  warn "等待进程退出超时，仍在运行: ${pids}"
  warn "若还原 data/ 失败，请手动停止进程后再执行本脚本。"
  return 0
}

restore_file() {
  local src="$1"
  local dest="$2"
  local label="$3"
  if [[ ! -f "$src" ]]; then
    info "跳过 ${label}（备份中没有该文件）"
    return 0
  fi
  info "还原 ${label}: ${src} -> ${dest}"
  cp -a "$src" "$dest"
  info "完成: ${label}"
}

restore_tgz() {
  local tgz="$1"
  local dir_name="$2"
  local label="$3"
  if [[ ! -f "$tgz" ]]; then
    info "跳过 ${label}（备份中没有 $(basename "$tgz")）"
    return 0
  fi

  local target="${ROOT_DIR}/${dir_name}"
  if [[ -e "$target" ]]; then
    info "删除当前 ${dir_name}/，再解开备份（避免残留旧文件）"
    rm -rf "$target"
  fi
  info "还原 ${label}: ${tgz}"
  tar -xzf "$tgz" -C "$ROOT_DIR"
  if [[ ! -e "$target" ]]; then
    err "解压后未出现 ${dir_name}/，备份包结构可能不对。"
    exit 1
  fi
  info "完成: ${label}"
}

snapshot_current() {
  local snap_dir="$1"
  mkdir -p "$snap_dir"
  info "把还原前的现网文件再存一份到: ${snap_dir}"
  if [[ -f "$CONFIG_FILE" ]]; then
    cp -a "$CONFIG_FILE" "${snap_dir}/config.yaml"
    info "已保存当前 config.yaml"
  fi
  if [[ -d "$ROOT_DIR/data" ]]; then
    tar -czf "${snap_dir}/data.tgz" -C "$ROOT_DIR" data
    info "已保存当前 data/"
  fi
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --backup)
        BACKUP_ID="${2:-}"
        if [[ -z "$BACKUP_ID" ]]; then
          err "--backup 需要时间戳或目录路径"
          exit 1
        fi
        shift 2
        ;;
      --list)
        LIST_ONLY=1
        shift 1
        ;;
      --yes)
        YES=1
        shift 1
        ;;
      --config-only)
        RESTORE_CONFIG=1
        RESTORE_DATA=0
        RESTORE_KNOWLEDGE=0
        RESTORE_TOOLS=0
        shift 1
        ;;
      --data-only)
        RESTORE_CONFIG=0
        RESTORE_DATA=1
        RESTORE_KNOWLEDGE=0
        RESTORE_TOOLS=0
        shift 1
        ;;
      --venv)
        RESTORE_VENV=1
        shift 1
        ;;
      --no-stop)
        STOP_SERVICE=0
        shift 1
        ;;
      --force-stop)
        FORCE_STOP=1
        shift 1
        ;;
      --no-restart)
        RESTART=0
        shift 1
        ;;
      --http|--https)
        RUN_ARGS+=("$1")
        shift 1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        err "未知参数: $1"
        usage
        exit 1
        ;;
    esac
  done

  print_banner

  if [[ "$LIST_ONLY" -eq 1 ]]; then
    list_backups || exit 1
    info "还原最新一次:  ./restore-from-backup.sh --yes"
    info "还原指定备份:  ./restore-from-backup.sh --backup <时间戳> --yes"
    exit 0
  fi

  print_step "步骤 1/4  选择备份"
  if ! list_backups; then
    exit 1
  fi

  local backup_dir=""
  if [[ -z "$BACKUP_ID" ]]; then
    BACKUP_ID="$(latest_backup_id)"
    if [[ -z "$BACKUP_ID" ]]; then
      err "没有可用备份。"
      exit 1
    fi
    info "未指定 --backup，将使用最新备份: ${BACKUP_ID}"
  else
    info "指定备份: ${BACKUP_ID}"
  fi

  if ! backup_dir="$(resolve_backup_dir "$BACKUP_ID")"; then
    err "找不到备份: ${BACKUP_ID}"
    err "请先 ./restore-from-backup.sh --list 查看可用时间戳。"
    exit 1
  fi
  info "备份目录: ${backup_dir}"

  echo ""
  info "本次将还原:"
  if [[ "$RESTORE_CONFIG" -eq 1 ]]; then
    [[ -f "${backup_dir}/config.yaml" ]] && info "  - config.yaml" || warn "  - config.yaml（备份中没有，将跳过）"
  fi
  if [[ "$RESTORE_DATA" -eq 1 ]]; then
    [[ -f "${backup_dir}/data.tgz" ]] && info "  - data/" || warn "  - data/（备份中没有，将跳过）"
  fi
  if [[ "$RESTORE_KNOWLEDGE" -eq 1 ]]; then
    [[ -f "${backup_dir}/knowledge_base.tgz" ]] && info "  - knowledge_base/" || info "  - knowledge_base/（备份中没有则跳过）"
  fi
  if [[ "$RESTORE_TOOLS" -eq 1 ]]; then
    if [[ -f "${backup_dir}/tools.tgz" || -f "${backup_dir}/roles.tgz" || -f "${backup_dir}/skills.tgz" ]]; then
      info "  - tools/ roles/ skills/（备份里有的才会还原）"
    else
      info "  - tools/ roles/ skills/（本次备份没有这些包，跳过）"
    fi
  fi
  if [[ "$RESTORE_VENV" -eq 1 ]]; then
    [[ -f "${backup_dir}/venv.tgz" ]] && info "  - venv/" || warn "  - venv/（备份中没有 venv.tgz）"
  fi
  echo ""
  info "不会还原源码（Go / web 等保持当前版本）。"
  info "还原 data/ 会先删掉当前 data/ 再解压备份，避免残留文件。"

  if [[ "$YES" -ne 1 ]]; then
    if [[ ! -t 0 ]]; then
      err "当前不是交互终端。请加上 --yes，例如:"
      err "  ./restore-from-backup.sh --yes"
      exit 1
    fi
    echo ""
    read -r -p "确认从该备份还原? (y/N) " ans
    if [[ "${ans:-N}" != "y" && "${ans:-N}" != "Y" ]]; then
      err "已取消，未改动任何文件。"
      exit 1
    fi
  else
    info "已指定 --yes，跳过交互确认。"
  fi

  stop_service

  print_step "步骤 3/4  还原文件"
  local snap_ts
  snap_ts="$(date +"%Y%m%d_%H%M%S")"
  local snap_dir="${BACKUP_ROOT}/pre-restore-${snap_ts}"
  snapshot_current "$snap_dir"

  if [[ "$RESTORE_CONFIG" -eq 1 ]]; then
    restore_file "${backup_dir}/config.yaml" "$CONFIG_FILE" "config.yaml"
  fi
  if [[ "$RESTORE_DATA" -eq 1 ]]; then
    restore_tgz "${backup_dir}/data.tgz" "data" "data/"
  fi
  if [[ "$RESTORE_KNOWLEDGE" -eq 1 ]]; then
    restore_tgz "${backup_dir}/knowledge_base.tgz" "knowledge_base" "knowledge_base/"
  fi
  if [[ "$RESTORE_TOOLS" -eq 1 ]]; then
    restore_tgz "${backup_dir}/tools.tgz" "tools" "tools/"
    restore_tgz "${backup_dir}/roles.tgz" "roles" "roles/"
    restore_tgz "${backup_dir}/skills.tgz" "skills" "skills/"
  fi
  if [[ "$RESTORE_VENV" -eq 1 ]]; then
    restore_tgz "${backup_dir}/venv.tgz" "venv" "venv/"
  fi

  print_step "步骤 4/4  还原结果"
  info "已从备份还原: ${backup_dir}"
  info "还原前的现网副本: ${snap_dir}"
  echo ""
  info "若这次还原不符合预期，可用还原前副本再还原一次:"
  info "  ./restore-from-backup.sh --backup ${snap_dir} --yes"
  echo ""

  if [[ "$RESTART" -ne 1 ]]; then
    info "已指定 --no-restart，服务尚未启动。"
    info "请稍后执行: ./run.sh ${RUN_ARGS[*]}"
    return 0
  fi

  info "接下来调用 ./run.sh 启动服务。"
  echo ""
  exec ./run.sh "${RUN_ARGS[@]}"
}

main "$@"
