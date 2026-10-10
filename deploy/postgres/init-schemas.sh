#!/bin/sh
# 数据卷首次初始化时创建开发 / 测试 schema（TF_PG_SCHEMAS，逗号分隔）。
# 只在空卷上执行一次；已有卷由 make db-schemas 幂等补齐。
set -eu
for schema in $(printf '%s' "${TF_PG_SCHEMAS:-dev,test}" | tr ',' ' '); do
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "CREATE SCHEMA IF NOT EXISTS \"$schema\" AUTHORIZATION \"$POSTGRES_USER\";"
done
