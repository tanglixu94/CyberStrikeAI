#!/usr/bin/env bash
set -euo pipefail

# 离线升级：运维将源码压缩包放到指定目录后执行本脚本。
# 不会覆盖：config.yaml、data/、venv/、.upgrade-backup/、tmp/ 等运行数据。

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BINARY_NAME="cyberstrike-ai"
CONFIG_FILE="$ROOT_DIR/config.yaml"
DATA_DIR="$ROOT_DIR/data"
VENV_DIR="$ROOT_DIR/venv"
KNOWLEDGE_BASE_DIR="$ROOT_DIR/knowledge_base"
DEFAULT_PACKAGE_DIR="$ROOT_DIR/upgrade-packages"
BACKUP_BASE_DIR="$ROOT_DIR/.upgrade-backup"

PACKAGE_PATH=""
PACKAGE_DIR="$DEFAULT_PACKAGE_DIR"
PRESERVE_VENV=1
PRESERVE_TOOLS=0
PRESERVE_KNOWLEDGE=1
STOP_SERVICE=1
FORCE_STOP=0
RESTART=1
YES=0
RUN_ARGS=()
UPGRADE_TMP_DIR=""

usage() {
  cat <<EOF
用法:
  ./upgrade-from-zip.sh [--package <压缩包>] [--dir <目录>] [--yes]

  1. 将源码压缩包（.zip / .tar.gz / .tgz）上传到目录：
       ${DEFAULT_PACKAGE_DIR}/
     或任意路径，再用 --package / --dir 指定。
  2. 在项目根目录执行本脚本。

选项:
  --package <路径>     指定压缩包文件
  --dir <目录>         从该目录取修改时间最新的压缩包（默认: upgrade-packages/）
  --yes                不交互确认
  --no-venv            不保留 venv/（随后由 run.sh 重装 Python 依赖）
  --preserve-tools     不覆盖服务器上的 tools/、roles/、skills/
  --sync-knowledge     用压缩包里的 knowledge_base/ 覆盖服务器（默认保留）
  --no-stop            不停正在运行的服务
  --force-stop         当前目录匹配不到进程时，也停止其它 cyberstrike-ai
  --no-restart         同步完不执行 ./run.sh
  --http / --https     传给 run.sh（重启时）
  -h, --help           显示帮助

默认不会覆盖:
  config.yaml
  data/                  对话、用户、SQLite 等运行数据
  venv/
  .upgrade-backup/
  tmp/
  knowledge_base/        除非加 --sync-knowledge
  upgrade-packages/      压缩包存放目录

tools/、roles/、skills/ 默认会随压缩包更新；若服务器上有本地改过的工具定义，请加 --preserve-tools。
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
  离线压缩包升级
==========================================
说明:
  本脚本用已上传的源码压缩包更新当前目录代码，然后编译并启动。
  不会从 GitHub 下载任何内容。

  以下内容默认保留，即使压缩包里有同名文件也不会覆盖:
    - config.yaml          现网配置（AI 通道、端口等）
    - data/                运行数据（用户、对话、SQLite）
    - venv/                Python 虚拟环境
    - knowledge_base/      知识库文件（可用 --sync-knowledge 改为覆盖）
    - .upgrade-backup/     历史升级备份
    - tmp/  chat_uploads/  临时与上传文件
    - upgrade-packages/    压缩包存放目录

  tools/、roles/、skills/ 默认会随压缩包更新。
  若服务器上这些目录有单独改动、不能丢，请加 --preserve-tools。

  升级前会把 config.yaml 和 data/ 备份到 .upgrade-backup/<时间戳>/
  失败时用 ./restore-from-backup.sh 还原，不要手工覆盖 data/。

EOF
}

print_step() {
  echo ""
  log "---------- $1 ----------"
}

print_plan() {
  info "部署目录: ${ROOT_DIR}"
  info "压缩包:   ${PACKAGE_PATH}"
  if [[ -f "$PACKAGE_PATH" ]]; then
    info "包大小:   $(du -h "$PACKAGE_PATH" 2>/dev/null | awk '{print $1}')"
  fi
  echo ""
  info "将保留（不覆盖）:"
  info "  - config.yaml"
  info "  - data/              （对话、用户、数据库）"
  info "  - .upgrade-backup/"
  info "  - tmp/  chat_uploads/  upgrade-packages/"
  if [[ "$PRESERVE_VENV" -eq 1 ]]; then
    info "  - venv/"
  else
    warn "  - venv/ 将被删除，随后由 run.sh 重装 Python 依赖"
  fi
  if [[ "$PRESERVE_KNOWLEDGE" -eq 1 ]]; then
    info "  - knowledge_base/"
  else
    warn "  - knowledge_base/ 将随压缩包覆盖"
  fi
  echo ""
  if [[ "$PRESERVE_TOOLS" -eq 1 ]]; then
    info "将保留（不覆盖）tools/、roles/、skills/"
  else
    info "将更新: tools/、roles/、skills/（随压缩包）"
    info "        若需保留服务器上的本地改动，请加 --preserve-tools 后重跑"
  fi
  echo ""
  if [[ "$STOP_SERVICE" -eq 1 ]]; then
    info "将先停止当前目录下的 ${BINARY_NAME} 进程"
  else
    warn "已指定 --no-stop，不会停止正在运行的服务"
  fi
  if [[ "$RESTART" -eq 1 ]]; then
    info "同步完成后将执行 ./run.sh ${RUN_ARGS[*]}（重新编译并启动）"
  else
    warn "已指定 --no-restart，同步后需要手动执行 ./run.sh"
  fi
}

stop_service() {
  print_step "步骤 2/6  停止正在运行的服务"
  if [[ "$STOP_SERVICE" -ne 1 ]]; then
    info "已跳过（--no-stop）。若文件仍被占用，同步可能不完整。"
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
      info "服务已停止，可以覆盖代码文件。"
      return 0
    fi
    sleep 1
  done

  warn "等待进程退出超时，仍在运行: ${pids}"
  warn "若后续 rsync 报文件占用，请手动 kill 后再执行本脚本。"
  return 0
}

backup_dir_tgz() {
  local label="$1"
  local path="$2"
  if [[ -e "$path" ]]; then
    info "正在备份 ${label} -> ${BACKUP_BASE_DIR}/$(basename "$path").tgz"
    tar -czf "${BACKUP_BASE_DIR}/$(basename "$path").tgz" -C "$ROOT_DIR" "$(basename "$path")"
    info "完成: ${label}"
  else
    info "跳过 ${label}（目录不存在，无需备份）"
  fi
}

backup_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    cp -a "$CONFIG_FILE" "${BACKUP_BASE_DIR}/config.yaml"
    info "已备份 config.yaml -> ${BACKUP_BASE_DIR}/config.yaml"
  else
    warn "未找到 config.yaml，跳过配置备份"
  fi
}

confirm_or_exit() {
  print_step "步骤 1/6  确认升级范围"
  print_plan

  if [[ "$YES" -eq 1 ]]; then
    info "已指定 --yes，跳过交互确认，开始升级。"
    return 0
  fi

  if [[ ! -t 0 ]]; then
    err "当前不是交互终端（例如通过管道执行）。请加上 --yes，例如:"
    err "  ./upgrade-from-zip.sh --yes"
    exit 1
  fi

  echo ""
  read -r -p "确认以上内容并开始升级? (y/N) " ans
  if [[ "${ans:-N}" != "y" && "${ans:-N}" != "Y" ]]; then
    err "已取消，未改动任何文件。"
    exit 1
  fi
  info "已确认，继续。"
}

is_package_file() {
  local name
  name="$(basename "$1")"
  [[ "$name" == *.zip || "$name" == *.tar.gz || "$name" == *.tgz || "$name" == *.tar ]]
}

resolve_package() {
  if [[ -n "$PACKAGE_PATH" ]]; then
    if [[ ! -f "$PACKAGE_PATH" ]]; then
      err "压缩包不存在: ${PACKAGE_PATH}"
      exit 1
    fi
    PACKAGE_PATH="$(cd "$(dirname "$PACKAGE_PATH")" && pwd)/$(basename "$PACKAGE_PATH")"
    if ! is_package_file "$PACKAGE_PATH"; then
      err "不支持的压缩包格式（需要 .zip / .tar.gz / .tgz / .tar）: ${PACKAGE_PATH}"
      exit 1
    fi
    return 0
  fi

  if [[ ! -d "$PACKAGE_DIR" ]]; then
    err "未指定 --package，且目录不存在: ${PACKAGE_DIR}"
    err "请先把压缩包放到该目录，或使用: --package /path/to/xxx.zip"
    exit 1
  fi

  local latest=""
  local f
  # 按修改时间取最新的压缩包
  while IFS= read -r f; do
    latest="$f"
  done < <(find "$PACKAGE_DIR" -maxdepth 1 -type f \( \
    -name '*.zip' -o -name '*.tar.gz' -o -name '*.tgz' -o -name '*.tar' \
  \) -printf '%T@ %p\n' 2>/dev/null | sort -n | awk '{ $1=""; sub(/^ /,""); print }')

  if [[ -z "$latest" ]]; then
    # busybox/mac 无 -printf 时的回退
    latest="$(ls -1t "$PACKAGE_DIR"/*.zip "$PACKAGE_DIR"/*.tar.gz "$PACKAGE_DIR"/*.tgz "$PACKAGE_DIR"/*.tar 2>/dev/null | head -n 1 || true)"
  fi

  if [[ -z "$latest" || ! -f "$latest" ]]; then
    err "目录中没有压缩包: ${PACKAGE_DIR}"
    err "请先把 .zip 或 .tar.gz 上传到该目录，或用 --package 指定文件，例如:"
    err "  mkdir -p ${DEFAULT_PACKAGE_DIR}"
    err "  # 上传压缩包后再执行:"
    err "  ./upgrade-from-zip.sh --yes"
    err "  ./upgrade-from-zip.sh --package /tmp/xxx.zip --yes"
    exit 1
  fi

  PACKAGE_PATH="$(cd "$(dirname "$latest")" && pwd)/$(basename "$latest")"
  info "未指定 --package，已从 ${PACKAGE_DIR} 选取最新压缩包。"
}

extract_package() {
  local dest="$1"
  local name
  name="$(basename "$PACKAGE_PATH")"
  print_step "步骤 4/6  解压压缩包"
  info "文件: ${PACKAGE_PATH}"
  info "解压到临时目录: ${dest}"
  info "解压后会在包内查找 run.sh 和 go.mod，以定位源码根目录（支持多一层目录，如 CyberStrikeAI-main/）。"
  mkdir -p "$dest"

  case "$name" in
    *.zip)
      if ! have_cmd unzip; then
        err "需要 unzip 才能解压 zip。例如: sudo apt-get install -y unzip"
        exit 1
      fi
      unzip -q -o "$PACKAGE_PATH" -d "$dest"
      ;;
    *.tar.gz|*.tgz)
      tar -xzf "$PACKAGE_PATH" -C "$dest"
      ;;
    *.tar)
      tar -xf "$PACKAGE_PATH" -C "$dest"
      ;;
    *)
      err "不支持的压缩包: ${name}"
      exit 1
      ;;
  esac
  info "解压完成。"
}

find_src_root() {
  local extract_dir="$1"
  if [[ -f "${extract_dir}/run.sh" && -f "${extract_dir}/go.mod" ]]; then
    printf '%s\n' "$extract_dir"
    return 0
  fi

  local found
  found="$(find "$extract_dir" -maxdepth 3 \( -name run.sh -o -name go.mod \) -print 2>/dev/null | head -n 20 || true)"
  local line dir
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    dir="$(dirname "$line")"
    if [[ -f "${dir}/run.sh" && -f "${dir}/go.mod" ]]; then
      printf '%s\n' "$dir"
      return 0
    fi
  done <<<"$found"

  return 1
}

sync_code() {
  local new_src_dir="$1"

  if ! have_cmd rsync; then
    err "需要 rsync 才能安全同步。例如: sudo apt-get install -y rsync"
    exit 1
  fi

  local -a rsync_args
  rsync_args+=( -a --delete )
  rsync_args+=( --exclude=".upgrade-backup/" )
  rsync_args+=( --exclude="config.yaml" )
  rsync_args+=( --exclude="data/" )
  rsync_args+=( --exclude="tmp/" )
  rsync_args+=( --exclude="chat_uploads/" )
  rsync_args+=( --exclude="upgrade-packages/" )
  rsync_args+=( --exclude=".git/" )
  rsync_args+=( --filter="P upgrade-from-zip.sh" )
  rsync_args+=( --filter="P restore-from-backup.sh" )
  rsync_args+=( --filter="P upgrade.sh" )

  if [[ "$PRESERVE_VENV" -eq 1 ]]; then
    rsync_args+=( --exclude="venv/" )
  fi

  if [[ "$PRESERVE_KNOWLEDGE" -eq 1 ]]; then
    rsync_args+=( --exclude="knowledge_base/" )
  fi

  if [[ "$PRESERVE_TOOLS" -eq 1 ]]; then
    rsync_args+=( --exclude="tools/" )
    rsync_args+=( --exclude="roles/" )
    rsync_args+=( --exclude="skills/" )
  fi

  print_step "步骤 5/6  同步代码（rsync，不覆盖运行数据）"
  info "来源: ${new_src_dir}/"
  info "目标: ${ROOT_DIR}/"
  info "使用 rsync --delete：压缩包里已删除的源码文件，服务器上也会删掉；"
  info "被 exclude 的目录（如 data/、config.yaml）不会被删、也不会被覆盖。"
  rsync "${rsync_args[@]}" "${new_src_dir}/" "${ROOT_DIR}/"
  info "代码同步完成。"
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --package)
        PACKAGE_PATH="${2:-}"
        if [[ -z "$PACKAGE_PATH" ]]; then
          err "--package 需要文件路径"
          exit 1
        fi
        shift 2
        ;;
      --dir)
        PACKAGE_DIR="${2:-}"
        if [[ -z "$PACKAGE_DIR" ]]; then
          err "--dir 需要目录路径"
          exit 1
        fi
        shift 2
        ;;
      --yes)
        YES=1
        shift 1
        ;;
      --no-venv)
        PRESERVE_VENV=0
        shift 1
        ;;
      --preserve-tools)
        PRESERVE_TOOLS=1
        shift 1
        ;;
      --sync-knowledge)
        PRESERVE_KNOWLEDGE=0
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
        if [[ -z "$PACKAGE_PATH" && -f "$1" ]] && is_package_file "$1"; then
          PACKAGE_PATH="$1"
          shift 1
        else
          err "未知参数: $1"
          usage
          exit 1
        fi
        ;;
    esac
  done

  print_banner

  if [[ ! -f "$CONFIG_FILE" ]]; then
    err "未找到 ${CONFIG_FILE}。"
    err "请在已经部署并生成过 config.yaml 的项目根目录执行本脚本，不要在空目录或不完整拷贝上执行。"
    exit 1
  fi

  info "正在定位压缩包..."
  resolve_package
  info "压缩包已确定: ${PACKAGE_PATH}"

  confirm_or_exit
  stop_service

  local ts
  ts="$(date +"%Y%m%d_%H%M%S")"
  BACKUP_BASE_DIR="${BACKUP_BASE_DIR}/${ts}"
  mkdir -p "$BACKUP_BASE_DIR"

  print_step "步骤 3/6  备份现网配置和运行数据"
  info "备份目录: ${BACKUP_BASE_DIR}"
  info "只备份，不会在这一步修改正在使用的 data/ 和 config.yaml。"
  backup_config
  backup_dir_tgz "data" "$DATA_DIR"
  if [[ "$PRESERVE_VENV" -eq 1 ]]; then
    info "保留现有 venv/，不备份、不删除。"
  else
    if [[ -d "$VENV_DIR" ]]; then
      warn "--no-venv: 删除旧 venv/，稍后 run.sh 会重建"
      rm -rf "$VENV_DIR"
    else
      info "没有 venv/ 目录，无需删除。"
    fi
  fi
  if [[ "$PRESERVE_KNOWLEDGE" -eq 1 && -d "$KNOWLEDGE_BASE_DIR" ]]; then
    backup_dir_tgz "knowledge_base" "$KNOWLEDGE_BASE_DIR"
  fi
  if [[ "$PRESERVE_TOOLS" -eq 1 ]]; then
    [[ -d "$ROOT_DIR/tools" ]] && backup_dir_tgz "tools" "$ROOT_DIR/tools"
    [[ -d "$ROOT_DIR/roles" ]] && backup_dir_tgz "roles" "$ROOT_DIR/roles"
    [[ -d "$ROOT_DIR/skills" ]] && backup_dir_tgz "skills" "$ROOT_DIR/skills"
  fi
  info "备份完成。若升级失败，可从上述目录还原。"

  UPGRADE_TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "${UPGRADE_TMP_DIR:-}" >/dev/null 2>&1 || true' EXIT

  extract_package "$UPGRADE_TMP_DIR"

  local src_root=""
  if ! src_root="$(find_src_root "$UPGRADE_TMP_DIR")"; then
    err "解压后未找到 run.sh 和 go.mod。"
    err "请确认压缩包是完整项目源码，而不是只打了部分目录。"
    err "若 zip 里还有一层文件夹（如 CyberStrikeAI-main/），脚本会自动识别；若仍失败，请检查包内容。"
    exit 1
  fi
  info "已定位源码根目录: ${src_root}"

  sync_code "$src_root"

  chmod +x "$ROOT_DIR/run.sh" "$ROOT_DIR/upgrade-from-zip.sh" 2>/dev/null || true
  [[ -f "$ROOT_DIR/restore-from-backup.sh" ]] && chmod +x "$ROOT_DIR/restore-from-backup.sh" || true
  [[ -f "$ROOT_DIR/upgrade.sh" ]] && chmod +x "$ROOT_DIR/upgrade.sh" || true

  print_step "步骤 6/6  升级结果"
  info "代码已同步。config.yaml 与 data/ 未被覆盖。"
  info "本次备份: ${BACKUP_BASE_DIR}"
  echo ""
  info "若需要把配置或 data/ 退回本次备份，执行:"
  info "  ./restore-from-backup.sh --backup ${ts} --yes"
  info "  ./restore-from-backup.sh --list"
  echo ""

  if [[ "$RESTART" -ne 1 ]]; then
    info "已指定 --no-restart，服务尚未启动。"
    info "请稍后在项目根目录执行:"
    info "  ./run.sh ${RUN_ARGS[*]}"
    return 0
  fi

  info "接下来调用 ./run.sh：检查环境、按需重新编译、启动服务。"
  info "看到 ● ONLINE 或监听端口日志即表示启动成功。"
  echo ""
  # exec 不会触发 EXIT trap，先清掉解压临时目录
  rm -rf "${UPGRADE_TMP_DIR:-}" >/dev/null 2>&1 || true
  UPGRADE_TMP_DIR=""
  exec ./run.sh "${RUN_ARGS[@]}"
}

main "$@"
