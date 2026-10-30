# 文档密钥打码显示；Claude Code / Codex 一键配置脚本

- 日期：2026-10-30
- 分支：main（黑鹰选择直接在 main 修改）
- PR：
- 关键 commit：026f86998（密钥打码）

## 背景

黑鹰提了两个需求：

1. 文档页上展示的默认密钥要打码；去掉「示例中已填入你的真实密钥，请勿截图分享本页」这条提示。
2. 第三方工具接入里，Codex 和 Claude Code 增加一键配置脚本，支持 Windows / macOS / Linux，放在对应工具的接入文档里。

与黑鹰确认的取舍：

- 页面上显示打码后的密钥，点复制得到真实密钥，复制出去的示例可以直接运行。
- 脚本由站点托管，用户执行一行命令，密钥在脚本运行时交互输入，不留在命令历史里。
- 检测到没装工具时，脚本自动用官方方式安装后再配置。

## 变更

**密钥打码**（026f86998）

- 页面上的密钥显示为 `sk-前4位****后4位`；`maskApiKey` 写在 `lib/sample-keys.ts`。
- `DocContent` 拆成两套变量：`vars` 用于显示，`copyVars` 用于复制。代码块与右栏示例的复制按钮都复制真实密钥。
- 公共组件 `CodeBlockCopyButton` 新增一个可选参数 `value`，用来指定复制内容；不传时行为与原来相同。
- 删除「请勿截图」提示及它在 7 种语言里的翻译。

**一键配置脚本**

- 后端新增 `router/web_install_scripts.go`，提供 `GET /install/<工具>.<sh|ps1>`，工具为 `claude-code` 或 `codex`：
  - 脚本内容用 go:embed 嵌在 `router/install_scripts/`，返回时按「公共部分 + 工具部分」拼接。
  - 返回前填入站点地址（复用文档 SEO 的 `siteBaseURL`）和站点名。
  - 站点地址只接受普通 URL 字符，站点名去掉引号、`$`、反引号等字符，防止脚本注入。
  - PowerShell 版整体包进 `& { ... }`：这样 iex 不会把辅助函数留在用户的会话里，出错也不会调用 exit 关掉窗口。
  - 返回头为 `text/plain; charset=utf-8`。
- 公共流程（bash 与 PowerShell 两套）：
  1. 读取密钥：交互输入时不回显；也可以用环境变量 `TOKENFUNC_API_KEY` 直接传入。
  2. 调 `/v1/models` 校验密钥（不扣费），401 / 403 时给出明确提示。
  3. 从这把密钥可用的模型里选默认模型：优先列出同系列模型，有多个时让用户选；没有交互终端时直接取第一个。
  4. 未安装工具时，用官方安装脚本安装，失败再退回 npm。设置 `TOKENFUNC_SKIP_INSTALL=1` 可以跳过安装。
  5. 改写配置前先备份原文件。
- Claude Code：把三项合并进 `settings.json` 的 `env`，删除会冲突的 `ANTHROPIC_API_KEY`，其他设置保持不变，文件权限设为 600。
  - bash 版按顺序找可用工具来合并 JSON：Node → macOS 自带的 JXA → Python。macOS 上 JXA 排在 Python 前面，因为没装命令行工具时，调用 `/usr/bin/python3` 会弹出安装窗口。
  - 三者都没有时：文件不存在就直接写新文件；文件已存在则停止，并提示用户手动修改，不会覆盖原有内容。
  - PowerShell 版用 ConvertFrom-Json / ConvertTo-Json 合并，写出时不带 BOM。
- Codex：
  - 在 `config.toml` 中删除旧的顶层 `model` / `model_provider` 和旧的 `[model_providers.tokenfunc]` 小节，再把这两行写到文件最前面，在文件末尾追加新的提供方小节。多次运行结果一致。
  - 密钥按文档约定放在环境变量 `TOKENFUNC_API_KEY`：macOS / Linux 写进对应 shell 的启动文件（zsh / bash / fish / profile），并替换掉旧的同名行；Windows 保存为用户级环境变量。
- 文档：在 Claude Code 和 Codex 两页（中英文）新增「方式一：一键配置脚本（推荐）」，内容包括 macOS / Linux 与 Windows 两个标签页的一行命令，以及查看脚本源码的链接。原来的 CC Switch 和手动配置顺延为方式二、方式三。

## 验证

- 前端：
  - `bunx vitest run src/features/docs`：13 个文件、139 个用例全部通过。
  - 新增用例：`maskApiKey` 的 3 种情况；页面上显示打码密钥、点复制拿到的是真实密钥。
  - `bunx tsc -b` 通过，lint 无 error，`bun run build` 预渲染 52 页。
- 后端：
  - `go test ./router/`：新增 `web_install_scripts_test.go`，覆盖四个脚本都完成拼接与填充、PowerShell 版包在脚本块里、过滤危险字符、拒绝未知脚本和路径穿越、返回 text/plain、Host 不安全时返回 503。
  - `GOWORK=off go build ./...` 通过，gofmt 无输出。
- 脚本静态检查：shellcheck 只有一条 SC2016（JS 代码有意放在单引号里），已加注释关闭。
- 端到端测试：都通过 `curl | bash` 或 `irm | iex` 从本地 API 真实拉取脚本，使用开发库 demo_carol 的测试令牌：
  - macOS（走 JXA）：已有的 permissions、theme、HTTPS_PROXY 都保留，ANTHROPIC_API_KEY 被删除，文件权限 600。
  - macOS Codex：已有的 approval_policy、其他提供方、profiles 都保留，旧的 tokenfunc 小节被替换；用 expect 模拟输入密钥（不回显）并选择第 2 个模型，结果正确；运行第二次结果不变。
  - Linux（Alpine）分四种情况：只有 Python、只有 Node、两者都没有且配置文件已存在（脚本停止并提示）、两者都没有的全新安装（直接写入新文件）。Codex 连续运行两次结果一致，`.bashrc` 里只保留一行密钥。
  - Linux（Debian）真实安装：不跳过安装，用官方脚本装上了 Claude Code 2.1.314 和 Codex 0.166.0，并完成配置；Codex 安装器写进 `.bashrc` 的 PATH 行被保留。
  - PowerShell 7.4.6：官方镜像只有 amd64，在 Apple Silicon 上通过 qemu 运行会崩溃，于是自建了 arm64 测试镜像。验证了 settings.json 合并、不带 BOM、Codex 两次运行结果一致、用户会话里没有残留函数。
- 浏览器：用本地构建登录 demo_carol 检查，页面上的密钥显示为 `sk-vE3v****Mt4f`，正文中找不到完整密钥，「请勿截图」提示已消失；拦截剪贴板写入后确认，复制按钮复制的是完整密钥。
- 截图：`.tmp/docs-key-masked.png`、`.tmp/docs-one-click-claude-code.jpg`。

## 遗留

- 没在真实的 Windows 和 Windows PowerShell 5.1 上测过：测试用的是 Linux 上的 PowerShell 7。脚本已按 5.1 的差异处理了 TLS 1.2、无 BOM 写文件和 SecureString；Windows 上的官方安装路径、用户环境变量写入注册表，需要在 Windows 实机上确认一次。
- PowerShell 版交互输入密钥与选择模型的路径没做自动化测试（容器里没有交互终端），bash 版用 expect 测过。
- 代码块的「下载」按钮下载的是显示内容（密钥已打码），和复制按钮不一样。这是有意保留的：下载的文件更容易被转发。
- Codex 的密钥按文档约定放在环境变量里，已经打开的终端和桌面版 Codex 要重新打开才能读到。
