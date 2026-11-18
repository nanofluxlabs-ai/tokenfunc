# 一键配置脚本在 macOS 上因变量后接全角标点报 unbound variable 退出

- 日期：2026-11-19
- 分支：main
- PR：
- 关键 commit：e645e8f4d

## 背景

2026-11-18 发版时，`deploy/k8s/scripts/deploy.sh` 最后一行 echo 报 `IMAGE�: 未绑定的变量`。顺着同类写法排查，发现给客户用的一键配置脚本也有同样的问题。

## 变更

- 以下 4 个 .sh 文件里，凡是变量后面紧跟非 ASCII 字符（全角逗号、括号、句号等），都从 `$VAR` 改为 `${VAR}`：
  - `router/install_scripts/common.sh`
  - `router/install_scripts/claude-code.sh`
  - `scripts/tokenfunc/worktree-env.sh`
  - `deploy/k8s/scripts/bootstrap.sh`
- `deploy.sh` 已在 2026-11-18 的发布报告提交（9d949d7db）里修复。
- 在 `router/web_install_scripts_test.go` 加了门禁：嵌入的 .sh 中，变量后紧跟非 ASCII 字符就判失败。
- .ps1 不改：PowerShell 不会把全角标点并进变量名（容器里用 pwsh 实测过）。

## Bug 根因

- macOS 自带的 bash 3.2 和 Homebrew 装的 bash 5.2，在 UTF-8 locale 下会把 `$VAR` 后面紧跟的多字节字符的第一个字节当作变量名的一部分。这个变量不存在，脚本开了 `set -u`，于是直接退出。Linux 上的 bash 5.2（C.UTF-8）不受影响。
- 影响最大的是 `claude-code.sh` 中 `local invalid="无法解析已有的 $file（…"` 这一行：
  - 它是普通赋值，每次运行都会执行，不只在出错时才走到。
  - 后果：macOS 用户用系统 bash 执行 `curl …/install/claude-code.sh | bash` 时，**每次都在写配置之前退出（exit 1）**，Claude Code 的一键配置在 Mac 上完全不能用。
  - 时间范围：从这个脚本上线起一直存在。
- 其余几处在报错分支或结束提示里：要么让客户看不到真正的错误原因，要么在配置已经写完后误报失败。
- `codex.sh` 的执行路径没有碰到这些行，实测能正常完成。

## 验证

- 端到端，环境为 `env -i`、`LANG=zh_CN.UTF-8`、`/bin/bash` 3.2，用临时 HOME，冒烟密钥只调用 /v1/models，不扣费：
  - 线上当前的 `claude-code.sh`：exit 1，报错 `line 189: file�: unbound variable`，`~/.claude` 没有生成。
  - 修复后，用本地 common.sh 与 claude-code.sh 拼接并填好占位符：exit 0，`settings.json` 写入 BASE_URL、TOKEN、MODEL。
  - `codex.sh` 修复前后都是 exit 0。
- `go test ./router/ -run Install -count=1`：ok。撤回脚本修复后，新门禁在 common.sh 和 claude-code.sh 共报出 6 处。
- `bash -n` 和 `/bin/bash -n` 对上述 4 个文件以及 codex.sh 都通过。

## 遗留

- 上游 / 卖家自带的脚本里也有同样写法，没有改：`tokenfunc-codex2api/deploy.sh`、`tokenfunc-crs/scripts/manage.sh`。我们的流程不用这两个脚本。
