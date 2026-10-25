#!/usr/bin/env bash
# tke-local-image.sh — 本机构建 tokenfunc 镜像并推送 GHCR（GitHub Actions 构建失败时 /release-tke 自动回退使用）。
#
# 用法:
#     scripts/tokenfunc/tke-local-image.sh <tag>              # 构建并推送 ghcr.io/nanofluxlabs-ai/tokenfunc:<tag> 与 :latest
#     scripts/tokenfunc/tke-local-image.sh <tag> --no-push    # 只构建并载入本机 docker（演练 / 自检用，不碰 GHCR）
#
# 与 CI（.github/workflows/deploy-ghcr.yml + Dockerfile）的差异：
#   - Docker VM 内存有限，模拟 amd64 跑 rsbuild 会被 OOM Kill：前端改在宿主机编译（同一份 web/package.json / bun.lock）。
#   - Go 阶段用 --platform=$BUILDPLATFORM 原生交叉编译到 linux/amd64（CGO_ENABLED=0、GOWORK=off、pgo 与 ldflags 与 Dockerfile 相同）。
#   - VERSION 文件由 CI 的 Resolve version 步骤生成，仓库里没有；这里写入 <tag>。
#   - 仓库 .dockerignore 排除了 /web/dist（CI 在镜像内编译前端）；本脚本前端在宿主机编译，构建前把这一行从检出副本里去掉，
#     否则 COPY . . 不带 dist，Go 阶段的 test -f web/dist/index.html 静默失败（2026-10-25 自检踩到）。
#   - 运行层与 Dockerfile 相同（debian:bookworm-slim + ca-certificates/tzdata/libasan8/wget）。改 Dockerfile 时同步改这里的内嵌 Dockerfile。
#   - 推送不走 buildx --push / docker push，先 --load 到本机，再 docker save 导出，用 crane 强制 HTTP/1.1 推送
#     （tokensolo 2026-10-24 实测：HTTP/2 会在大层最后提交处卡死，换线路无用）。crane 不在 PATH 时 go install 到本机缓存目录。
#
# 退出码: 0 成功 · 1 构建 / 推送 / 核验失败 · 2 参数或本机环境不满足 · 3 GHCR 推送权限缺失（需人工授权）
set -euo pipefail
IMAGE="ghcr.io/nanofluxlabs-ai/tokenfunc"
EXPECTED_BUN="1.4.0" # 与 Dockerfile 的 oven/bun:1.4.0 保持一致
TAG="${1:-}"
PUSH=1
[[ "${2:-}" == "--no-push" ]] && PUSH=0
log() { printf '==> %s\n' "$*"; }
die() { printf '❌ %s\n' "$2" >&2; exit "$1"; }
[[ "${TAG}" =~ ^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$ ]] || die 2 "用法: $0 <vYYYY.MM.DD.N> [--no-push]"
REPO="$(git rev-parse --show-toplevel)"
git -C "${REPO}" rev-parse -q --verify "refs/tags/${TAG}" >/dev/null || die 2 "本地没有 tag ${TAG}（先 git fetch --tags）"

# ─── 本机环境 ─────────────────────────────────────────────────────────────────
docker info >/dev/null 2>&1 || die 2 "docker 未运行"
command -v bun >/dev/null || die 2 "缺少 bun"
BUN_VER="$(bun --version)"
[[ "${BUN_VER}" == "${EXPECTED_BUN}" ]] || log "⚠️ 本机 bun ${BUN_VER} 与 Dockerfile 的 ${EXPECTED_BUN} 不同，依赖解析可能有细微差异"
BUILDER="desktop-linux"
# Docker Desktop 未运行（本机用 OrbStack）时 desktop-linux 配置仍在，按 inspect 输出判断节点是否 running，否则回退当前 context 的 builder
docker buildx inspect "${BUILDER}" 2>&1 | grep -qE 'Status:[[:space:]]+running' || BUILDER="$(docker context show)"
if [[ ${PUSH} -eq 1 ]]; then
    if ! gh auth status 2>&1 | grep -q "write:packages"; then
        die 3 "gh 令牌缺少 write:packages，请执行: gh auth refresh -h github.com -s write:packages"
    fi
    gh auth token | docker login ghcr.io -u "$(gh api user --jq .login)" --password-stdin >/dev/null \
        || die 3 "docker login ghcr.io 失败"
    log "已用 gh 令牌登录 ghcr.io"
fi

# ─── 干净检出 ─────────────────────────────────────────────────────────────────
WORK="$(mktemp -d /tmp/tke-local-image.XXXXXX)"
SRC="${WORK}/src"
DONE=0
cleanup() {
    local rc=$?
    git -C "${REPO}" worktree remove --force "${SRC}" >/dev/null 2>&1 || true
    rm -rf "${WORK}"
    # macOS bash 3.2 在 set -u 报错退出时 EXIT trap 里的 $? 是 0：没跑到结尾一律按失败返回
    if [[ ${DONE} -ne 1 && ${rc} -eq 0 ]]; then rc=1; fi
    exit "${rc}"
}
trap cleanup EXIT
git -C "${REPO}" worktree add -q --detach "${SRC}" "${TAG}"
printf '%s\n' "${TAG}" > "${SRC}/VERSION"
log "检出 ${TAG} → ${SRC}（$(git -C "${SRC}" log --oneline -1)）"

# ─── 前端（宿主机编译，rsbuild）──────────────────────────────────────────────
(
    cd "${SRC}/web"
    for i in 1 2 3; do
        bun install --frozen-lockfile && break
        [[ ${i} -eq 3 ]] && exit 1
        log "bun install 失败，5 秒后重试（${i}/3）"
        sleep 5
    done
    DISABLE_ESLINT_PLUGIN='true' VITE_REACT_APP_VERSION="${TAG}" NODE_OPTIONS=--max-old-space-size=4096 bun run build
) || die 1 "前端编译失败"
[[ -f "${SRC}/web/dist/index.html" ]] || die 1 "前端产物缺少 web/dist/index.html"
log "前端编译完成（VITE_REACT_APP_VERSION=${TAG}）"
# 让宿主机编好的 dist 进入构建上下文（只改检出副本，不动仓库）
sed -i '' '/^\/web\/dist$/d' "${SRC}/.dockerignore"
if grep -q '^/web/dist$' "${SRC}/.dockerignore"; then die 1 ".dockerignore 仍排除 /web/dist"; fi

# ─── 镜像（Go 交叉编译 + 运行层，与 Dockerfile 的 builder2 / runtime 对齐）────
mkdir -p "${WORK}/df"
cat > "${WORK}/df/Dockerfile" <<'DOCKERFILE'
FROM --platform=$BUILDPLATFORM golang:1.26.1-alpine AS builder2
ENV GO111MODULE=on CGO_ENABLED=0 GOWORK=off
ARG TARGETOS
ARG TARGETARCH
ENV GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64}
ENV GOEXPERIMENT=greenteagc
WORKDIR /build
ADD go.mod go.sum ./
ADD relaykit/go.mod ./relaykit/go.mod
ADD tokenkit/go.mod ./tokenkit/go.mod
RUN go mod download
COPY . .
RUN { test -f web/dist/index.html || { echo "web/dist/index.html missing in build context" >&2; exit 1; }; } \
    && go build -pgo="$(go list -m -f '{{.Dir}}' github.com/Calcium-Ion/moejs)/default.pgo" \
       -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'" -o tokenfunc

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata libasan8 wget \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates
COPY --from=builder2 /build/tokenfunc /
COPY LICENSE NOTICE THIRD-PARTY-LICENSES.md /licenses/
EXPOSE 3000
WORKDIR /data
ENTRYPOINT ["/tokenfunc"]
DOCKERFILE
build() {
    docker buildx build --builder "${BUILDER}" --platform linux/amd64 -f "${WORK}/df/Dockerfile" \
        --provenance=false --sbom=false \
        -t "${IMAGE}:${TAG}" -t "${IMAGE}:latest" --load --progress=plain "${SRC}"
}
log "构建 linux/amd64 镜像（builder=${BUILDER}，--load）"
if ! build; then
    log "构建失败，10 秒后重试一次（层已缓存）"
    sleep 10
    build || die 1 "镜像构建失败"
fi

# ─── 推送（crane + HTTP/1.1）──────────────────────────────────────────────────
CRANE_VERSION="v0.22.1"
crane_h1() { GODEBUG=http2client=0 "${CRANE}" "$@"; }
# macOS 没有 timeout：后台运行，超时就杀掉。传可执行文件而不是 shell 函数，否则杀不到里面的 crane
run_with_timeout() {
    local secs=$1; shift
    "$@" & local pid=$!
    ( sleep "${secs}"; kill "${pid}" 2>/dev/null ) & local watcher=$!
    local rc=0
    wait "${pid}" || rc=$?
    kill "${watcher}" 2>/dev/null || true
    wait "${watcher}" 2>/dev/null || true
    return "${rc}"
}
DIGEST=""
if [[ ${PUSH} -eq 1 ]]; then
    CRANE="$(command -v crane || true)"
    if [[ -z "${CRANE}" ]]; then
        CRANE_BIN="${XDG_CACHE_HOME:-$HOME/.cache}/tokenfunc-release/bin"
        CRANE="${CRANE_BIN}/crane"
        if [[ ! -x "${CRANE}" ]]; then
            command -v go >/dev/null || die 2 "缺少 crane 且没有 go，无法安装（brew install crane）"
            log "安装 crane ${CRANE_VERSION} → ${CRANE_BIN}"
            GOBIN="${CRANE_BIN}" go install "github.com/google/go-containerregistry/cmd/crane@${CRANE_VERSION}" || die 2 "crane 安装失败"
        fi
    fi
    docker save "${IMAGE}:${TAG}" -o "${WORK}/image.tar" || die 1 "docker save 失败"
    pushed=0
    for i in 1 2 3; do
        log "推送 ${IMAGE}:${TAG}（crane HTTP/1.1，第 ${i}/3 次，单次上限 10 分钟）"
        if run_with_timeout 600 env GODEBUG=http2client=0 "${CRANE}" push "${WORK}/image.tar" "${IMAGE}:${TAG}"; then
            pushed=1; break
        fi
        log "推送失败或超时，15 秒后重试（已上传的层会被跳过）"
        sleep 15
    done
    [[ ${pushed} -eq 1 ]] || die 1 "推送 GHCR 失败（3 次）"
    run_with_timeout 120 env GODEBUG=http2client=0 "${CRANE}" tag "${IMAGE}:${TAG}" latest || die 1 "更新 :latest 失败"
    DIGEST="$(crane_h1 digest "${IMAGE}:${TAG}" || true)"
    [[ "${DIGEST}" == sha256:* ]] || die 1 "GHCR 上查不到 ${IMAGE}:${TAG}"
    REMOTE_ARCH="$(crane_h1 config "${IMAGE}:${TAG}" | jq -r '"\(.os)/\(.architecture)"')"
    [[ "${REMOTE_ARCH}" == "linux/amd64" ]] || die 1 "GHCR 上镜像平台为 ${REMOTE_ARCH}，不是 linux/amd64"
fi

# ─── 核验 ─────────────────────────────────────────────────────────────────────
ARCH="$(docker image inspect "${IMAGE}:${TAG}" --format '{{.Os}}/{{.Architecture}}')"
[[ "${ARCH}" == "linux/amd64" ]] || die 1 "镜像平台为 ${ARCH}，不是 linux/amd64"
HITS="$(docker run --rm --platform linux/amd64 --entrypoint sh "${IMAGE}:${TAG}" -c "grep -c '${TAG}' /tokenfunc || true")"
[[ "${HITS:-0}" -gt 0 ]] || die 1 "二进制里找不到版本号 ${TAG}"
log "✅ 镜像就绪: ${IMAGE}:${TAG}（${ARCH}，二进制含版本号）${DIGEST:+ digest=${DIGEST}}"
[[ ${PUSH} -eq 1 ]] || log "（--no-push：未推送 GHCR）"
DONE=1
