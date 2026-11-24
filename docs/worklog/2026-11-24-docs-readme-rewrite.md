# 重写 README.md 为 tokenfunc 项目文档，删除上游语言版

- 日期：2026-11-24
- 分支：main
- PR：
- 关键 commit：

## 背景

仓库首页一直是上游 new-api 的英文宣传 README（含 en/fr/ja/zh_CN/zh_TW 五个语言版），与 tokenfunc 的商业定位不符。黑鹰要求基于项目业务特点与技术架构重写 README.md。

## 变更

- `README.md` 全量重写为中文：项目定位（企业 AI 网关 tokenfunc.com）、对客户的三个核心承诺与 SLA 口径、二开功能全景表（企业组织 / 账务 / 预算限额 / 员工自查 / 分组定价 / 推广分成 / 财务对账 / 落地页）、技术架构 ASCII 图（TKE master/slave 拓扑）、make 快速上手、发版（/release-tke）与上游同步（upstream-*）流程、文档索引、许可说明（上游 AGPLv3 + 二开商业代码）。
- 删除 `README.en.md` / `README.fr.md` / `README.ja.md` / `README.zh_CN.md` / `README.zh_TW.md`：仅互相引用，无其他代码或文档引用。

已知代价：README.md 是上游文件，之后每次 upstream-sync 都会在此文件冲突，解决方式固定为取我们的版本（黑鹰已确认接受）。

## 验证

- `grep -rln 'README.en.md|…'` 确认五个语言版只被彼此引用，删除不破坏链接。
- 通读新 README 中引用的文件路径（AGENTS.md、docs/tokenfunc/*、deploy/k8s/README.md、scripts/tokenfunc/tke-local-image.sh）均存在。

## 遗留

无。
