# tokenfunc 开发 / 测试 / 生产统一入口。协作约定见 docs/tokenfunc/development.md
#
#   make dev       起基础设施（docker）+ API（宿主机）+ 前端 dev server
#   make test-db   在共享实例的 test schema 上跑需要 PostgreSQL 的 Go 测试
#   make up        全栈 docker（与生产一致），用于联调或上线前验证
#
# 所有 TF_* 变量可通过 .env 或命令行覆盖；下面的默认值只适用于本地开发。
SHELL := /bin/bash
-include .env
export

TF_PG_USER        ?= tokenfunc
TF_PG_PASSWORD    ?= tokenfunc
TF_PG_DB          ?= tokenfunc
TF_PG_PORT        ?= 55432
TF_PG_SCHEMAS     ?= dev,test
TF_DEV_SCHEMA     ?= dev
TF_TEST_SCHEMA    ?= test
TF_REDIS_PASSWORD ?= tokenfunc
TF_REDIS_PORT     ?= 56379
TF_DEV_REDIS_DB   ?= 0
TF_TEST_REDIS_DB  ?= 1
TF_API_PORT       ?= 3000
TF_WEB_PORT       ?= 5173
TF_LOG_FORMAT     ?= text   # 宿主机开发保持文本日志；容器默认 json
TF_DEFAULT_LANGUAGE ?= zh-CN   # 服务端日志 / 未指定语言的提示默认语言，与容器一致
TF_SESSION_SECRET ?= tokenfunc-dev-session-secret

WEB_DIR     := ./web
COMPOSE     := docker compose
API_BIN     := .tmp/bin/tokenfunc
API_PID     := .tmp/api.pid
API_LOG_DIR := .tmp/logs
API_URL     := http://127.0.0.1:$(TF_API_PORT)

# 宿主机进程连接 docker 内实例用的地址
PG_HOST_URL    := postgresql://$(TF_PG_USER):$(TF_PG_PASSWORD)@127.0.0.1:$(TF_PG_PORT)/$(TF_PG_DB)
DEV_SQL_DSN    := $(PG_HOST_URL)?search_path=$(TF_DEV_SCHEMA)
# test 后面带 public：上游部分用例会用这个 DSN 新建临时库再连入，临时库里没有 test schema，
# 只写 test 会在建表时报 3F000；主库仍优先落在 test
TEST_SQL_DSN   := $(PG_HOST_URL)?search_path=$(TF_TEST_SCHEMA),public
REDIS_HOST_URL := redis://:$(TF_REDIS_PASSWORD)@127.0.0.1:$(TF_REDIS_PORT)
DEV_REDIS      := $(REDIS_HOST_URL)/$(TF_DEV_REDIS_DB)
TEST_REDIS     := $(REDIS_HOST_URL)/$(TF_TEST_REDIS_DB)

# 上游 make test 跑整个根模块；这里保持一致，CI 也用它
ROOT_MODULE   = $$(GOWORK=off go list -m)
ROOT_PACKAGES = $$(GOWORK=off go list -e ./... | grep -vxF "$(ROOT_MODULE)")
PKG ?= $(ROOT_PACKAGES)

.DEFAULT_GOAL := help
.PHONY: help env infra db-schemas api-build api api-stop web dev stop down reset logs psql redis-cli \
	build-web test test-db test-web up up-build up-down up-logs reset-setup logarchive-import \
	upstream-fetch upstream-status upstream-diff upstream-merge

help: ## 列出所有目标
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# ---------- 基础设施（docker：PostgreSQL + Redis） ----------

env: ## 没有 .env 时从 .env.example 复制一份
	@if [ ! -f .env ]; then cp .env.example .env && echo "已从 .env.example 生成 .env（本地开发默认值）"; fi

infra: env ## 启动 postgres + redis 并确保 dev/test schema 存在
	@$(COMPOSE) up -d --wait postgres redis
	@$(MAKE) --no-print-directory db-schemas

db-schemas: ## 幂等创建 TF_PG_SCHEMAS 中列出的 schema
	@for schema in $$(echo "$(TF_PG_SCHEMAS)" | tr ',' ' '); do \
		$(COMPOSE) exec -T -e PGOPTIONS="-c client_min_messages=warning" postgres \
			psql -v ON_ERROR_STOP=1 -U $(TF_PG_USER) -d $(TF_PG_DB) \
			-c "CREATE SCHEMA IF NOT EXISTS \"$$schema\" AUTHORIZATION \"$(TF_PG_USER)\";" >/dev/null; \
	done
	@echo "schema 就绪: $(TF_PG_SCHEMAS)"

stop: api-stop ## 停止 API 与基础设施容器（保留数据）
	@$(COMPOSE) --profile app stop

down: api-stop ## 删除容器（保留数据卷）
	@$(COMPOSE) --profile app down

reset: api-stop ## 删除容器和数据卷，回到全新状态（需确认）
	@read -p "将删除 tokenfunc 的 PostgreSQL/Redis 数据卷，继续？[y/N] " ans; \
	if [ "$$ans" = "y" ] || [ "$$ans" = "Y" ]; then $(COMPOSE) --profile app down -v; else echo "已取消"; fi

psql: ## 进入 psql（SCHEMA=dev 可改，默认 dev）
	@$(COMPOSE) exec -e PGOPTIONS="-c search_path=$(or $(SCHEMA),$(TF_DEV_SCHEMA))" postgres \
		psql -U $(TF_PG_USER) -d $(TF_PG_DB)

redis-cli: ## 进入 redis-cli（DB=0 可改，默认开发库）
	@$(COMPOSE) exec redis redis-cli -n $(or $(DB),$(TF_DEV_REDIS_DB))

# ---------- 宿主机 API 与前端 ----------

api-build: ## 编译 API 到 .tmp/bin/tokenfunc（没有前端产物时用占位页满足 go:embed）
	@mkdir -p $(WEB_DIR)/dist .tmp/bin
	@if [ ! -f $(WEB_DIR)/dist/index.html ]; then \
		echo '<!doctype html><html><head><title>tokenfunc dev</title></head><body>use frontend dev server</body></html>' > $(WEB_DIR)/dist/index.html; \
	fi
	@if [ -d $(WEB_DIR)/dist/static ]; then \
		echo "注意：web/dist 是 $$(date -r $(WEB_DIR)/dist/index.html '+%m-%d %H:%M') 的前端构建，:$(TF_API_PORT) 上看到的是这份旧页面；开发请访问 :$(TF_WEB_PORT)，要更新它执行 make build-web"; \
	fi
	@go build -o $(API_BIN) .

api: infra api-build api-stop ## 后台启动 API（宿主机，连 dev schema / redis db 0）
	@mkdir -p $(API_LOG_DIR)
	@SQL_DSN='$(DEV_SQL_DSN)' REDIS_CONN_STRING='$(DEV_REDIS)' SESSION_SECRET='$(TF_SESSION_SECRET)' \
		SESSION_COOKIE_SECURE=false ERROR_LOG_ENABLED=true BATCH_UPDATE_ENABLED=true NODE_NAME=tokenfunc-dev \
		LOG_FORMAT=$(TF_LOG_FORMAT) DEFAULT_LANGUAGE=$(TF_DEFAULT_LANGUAGE) \
		nohup $(API_BIN) --port $(TF_API_PORT) --log-dir $(API_LOG_DIR) > $(API_LOG_DIR)/api.out 2>&1 & \
		echo $$! > $(API_PID)
	@for i in $$(seq 1 60); do \
		if ! kill -0 $$(cat $(API_PID)) 2>/dev/null; then echo "API 启动失败（端口被占用时 :$(TF_API_PORT) 可能是别的进程在应答），见 $(API_LOG_DIR)/api.out"; tail -n 40 $(API_LOG_DIR)/api.out; exit 1; fi; \
		if curl -fsS $(API_URL)/api/status >/dev/null 2>&1; then echo "API 已就绪: $(API_URL) (pid $$(cat $(API_PID)))"; exit 0; fi; \
		sleep 1; \
	done; echo "等待 API 超时，见 $(API_LOG_DIR)/api.out"; exit 1

api-stop: ## 停止宿主机 API
	@if [ -f $(API_PID) ] && kill -0 $$(cat $(API_PID)) 2>/dev/null; then \
		kill $$(cat $(API_PID)) && echo "API 已停止 (pid $$(cat $(API_PID)))"; \
	fi; rm -f $(API_PID)

logs: ## 跟随宿主机 API 日志
	@tail -n 100 -f $(API_LOG_DIR)/api.out

web: ## 前端 dev server（前台，API 请求代理到 $(TF_API_PORT)）
	@echo "前端: http://localhost:$(TF_WEB_PORT)"
	@cd $(WEB_DIR) && bun install && bun run dev -- --host 0.0.0.0 --port $(TF_WEB_PORT)

dev: api web ## 一键开发：基础设施 + API + 前端（Ctrl-C 只停前端，API 用 make api-stop）

build-web: ## 生产构建前端到 web/dist（API 二进制会内嵌它）
	@cd $(WEB_DIR) && bun install --frozen-lockfile
	@cd $(WEB_DIR) && DISABLE_ESLINT_PLUGIN='true' VITE_REACT_APP_VERSION=$$(cat ../VERSION) bun run build

# ---------- 测试 ----------

# 与上游一致、不依赖数据库，CI 调用的就是它；main 包内嵌 web/dist，由 build-web 覆盖
test: ## Go 单元测试（根模块 + relaykit + tokenkit，不依赖数据库）
	@echo "Testing root Go module..."
	@GOWORK=off go test $(ROOT_PACKAGES)
	@echo "Testing relaykit Go module..."
	@cd relaykit && GOWORK=off go test ./...
	@echo "Testing tokenkit Go module..."
	@cd tokenkit && GOWORK=off go test ./...

# 多个包共用同一 test schema，并行 AutoMigrate 会抢建表（SQLSTATE 23505/42P01），固定 -p 1 串行
test-db: infra ## 需要 PostgreSQL 的 Go 测试，跑在 test schema / redis db 1（PKG=./model/... 可缩小范围）
	@TEST_POSTGRES_DSN='$(TEST_SQL_DSN)' REDIS_CONN_STRING='$(TEST_REDIS)' GOWORK=off go test -p 1 $(PKG)

test-web: ## 前端 vitest
	@cd $(WEB_DIR) && bun run test

logarchive-import: infra ## 把 COS 归档导回 dev 库的回放表 tf_logs_archive（ARGS='-day 2026-07-01'，COS 凭据取 .env）
	@SQL_DSN='$(DEV_SQL_DSN)' GOWORK=off go run ./cmd/logarchive-import $(ARGS)

# ---------- 上游同步（QuantumNous/new-api） ----------
# 只合上游 rc tag（v1.0.0-rc.N），不合 upstream/main HEAD；节奏、门禁与例外通道见 development.md §4.6，
# 完整流程由 /upstream-sync skill 驱动。这些目标都不 push。

TF_UPSTREAM_REMOTE   ?= upstream
TF_UPSTREAM_TAG_GLOB ?= v1.0.0-rc.*
UPSTREAM_BASE    = $$(git merge-base main $(TF_UPSTREAM_REMOTE)/main)
UPSTREAM_DIFF_DIR := .tmp/upstream

upstream-fetch: ## 拉取上游分支与 tag
	@git fetch --tags --quiet $(TF_UPSTREAM_REMOTE)

upstream-status: upstream-fetch ## 当前基线 rc、落后 commit 数、基线之后的上游 rc 列表
	@base=$(UPSTREAM_BASE); \
	baseline=$$(git describe --tags --match '$(TF_UPSTREAM_TAG_GLOB)' --abbrev=0 $$base 2>/dev/null || echo "(无 rc tag)"); \
	echo "基线: $$baseline  (merge-base $$(git log -1 --format='%h %ad' --date=short $$base))"; \
	echo "落后 $(TF_UPSTREAM_REMOTE)/main: $$(git rev-list --count main..$(TF_UPSTREAM_REMOTE)/main) commit"; \
	echo "基线之后的 rc（tag  日期  相对基线 commit 数）:"; \
	for t in $$(git tag --list '$(TF_UPSTREAM_TAG_GLOB)' --sort=creatordate); do \
		if ! git merge-base --is-ancestor $$t $$base 2>/dev/null; then \
			echo "  $$t  $$(git log -1 --format=%ad --date=short $$t)  +$$(git rev-list --count $$base..$$t)"; \
		fi; \
	done

upstream-diff: upstream-fetch ## REF=v1.0.0-rc.N 生成评估清单到 .tmp/upstream/<REF>.md（冲突 / 高风险 / 热点重叠 / commit 表）
	@test -n "$(REF)" || { echo "用法: make upstream-diff REF=v1.0.0-rc.N"; exit 1; }
	@mkdir -p $(UPSTREAM_DIFF_DIR)
	@TF_UPSTREAM_TAG_GLOB='$(TF_UPSTREAM_TAG_GLOB)' scripts/tokenfunc/upstream-diff.sh $(REF) main > $(UPSTREAM_DIFF_DIR)/$(REF).md
	@echo "评估清单: $(UPSTREAM_DIFF_DIR)/$(REF).md"; sed -n '3,9p' $(UPSTREAM_DIFF_DIR)/$(REF).md

upstream-merge: upstream-fetch ## REF=v1.0.0-rc.N 从 main（BASE= 可改）建 sync/upstream-<REF> 分支并合并（有冲突则停下，不 push）
	@test -n "$(REF)" || { echo "用法: make upstream-merge REF=v1.0.0-rc.N [BASE=main]"; exit 1; }
	@test -z "$$(git status --porcelain --untracked-files=no)" || { echo "工作区有未提交改动，先提交或 stash"; exit 1; }
	@git switch -c sync/upstream-$(REF) $(or $(BASE),main)
	@git merge --no-ff $(REF) -m "merge(upstream): sync new-api $(REF)" \
		|| echo "有冲突：只解冲突不重构，解决后 git add 并 git commit（沿用上面的 merge 信息）"

# ---------- 全栈 docker（生产形态） ----------

up: env ## 全栈启动（profile app）：生产用 .env 里的镜像；本地没有镜像时先 make up-build
	@$(COMPOSE) --profile app up -d --wait

up-build: env ## 从源码构建 API 镜像并全栈启动
	@$(COMPOSE) --profile app up -d --build --wait

up-down: ## 停止并删除全栈容器（保留数据卷）
	@$(COMPOSE) --profile app down

up-logs: ## 跟随 API 容器日志
	@$(COMPOSE) logs -f api

reset-setup: ## 清空开发库的初始化向导状态（SCHEMA=dev 可改），重启 API 后重新走 setup
	@$(COMPOSE) exec -T -e PGOPTIONS="-c search_path=$(or $(SCHEMA),$(TF_DEV_SCHEMA))" postgres \
		psql -v ON_ERROR_STOP=1 -U $(TF_PG_USER) -d $(TF_PG_DB) \
		-c 'DELETE FROM setups;' \
		-c 'DELETE FROM users WHERE role = 100;' \
		-c "DELETE FROM options WHERE key IN ('SelfUseModeEnabled', 'DemoSiteEnabled');"
	@echo "已重置，执行 make api 重启后重新进入初始化向导"
