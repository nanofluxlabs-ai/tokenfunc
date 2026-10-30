
# ---- Claude Code ----
# 把地址、密钥、默认模型合并进 ~/.claude/settings.json 的 env，保留文件里的其他设置

TF_SETTINGS_JS='
var d = {};
if (text && text.trim()) d = JSON.parse(text);
if (typeof d !== "object" || d === null || Array.isArray(d)) d = {};
if (typeof d.env !== "object" || d.env === null || Array.isArray(d.env)) d.env = {};
d.env.ANTHROPIC_BASE_URL = baseUrl;
d.env.ANTHROPIC_AUTH_TOKEN = key;
d.env.ANTHROPIC_MODEL = model;
delete d.env.ANTHROPIC_API_KEY;
var out = JSON.stringify(d, null, 2) + "\n";
'

tf_merge_settings_node() {
  node -e '
const fs = require("fs");
const file = process.env.TF_FILE;
const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const baseUrl = process.env.TF_BASE_URL, key = process.env.TF_KEY, model = process.env.TF_MODEL;
'"$TF_SETTINGS_JS"'
fs.writeFileSync(file, out);
'
}

# macOS 自带 JavaScript（JXA），不依赖 Node / Python
# shellcheck disable=SC2016 # JS 代码有意放在单引号里，由 osascript 解释，不需要 shell 展开
tf_merge_settings_jxa() {
  osascript -l JavaScript -e '
ObjC.import("Foundation");
function env(name) { return ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey(name)); }
var file = env("TF_FILE");
var text = "";
if ($.NSFileManager.defaultManager.fileExistsAtPath(file)) {
  text = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(file, $.NSUTF8StringEncoding, null)) || "";
}
var baseUrl = env("TF_BASE_URL"), key = env("TF_KEY"), model = env("TF_MODEL");
'"$TF_SETTINGS_JS"'
if (!$(out).writeToFileAtomicallyEncodingError(file, true, $.NSUTF8StringEncoding, null)) throw new Error("write failed");
' >/dev/null
}

tf_merge_settings_python() {
  python3 -c '
import json, os
file = os.environ["TF_FILE"]
d = {}
if os.path.exists(file):
    with open(file, encoding="utf-8") as f:
        text = f.read()
    if text.strip():
        d = json.loads(text)
if not isinstance(d, dict):
    d = {}
env = d.get("env")
if not isinstance(env, dict):
    env = {}
    d["env"] = env
env["ANTHROPIC_BASE_URL"] = os.environ["TF_BASE_URL"]
env["ANTHROPIC_AUTH_TOKEN"] = os.environ["TF_KEY"]
env["ANTHROPIC_MODEL"] = os.environ["TF_MODEL"]
env.pop("ANTHROPIC_API_KEY", None)
with open(file, "w", encoding="utf-8") as f:
    f.write(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
'
}

tf_write_claude_settings() {
  local dir="$HOME/.claude"
  local file="$dir/settings.json"
  mkdir -p "$dir"
  tf_backup "$file"
  export TF_FILE="$file" TF_BASE_URL TF_KEY TF_MODEL
  local invalid="无法解析已有的 $file（不是合法 JSON），请修正后重试，或按文档手动把配置合并进 env"
  # 依次用 Node、macOS 自带 JXA、Python 合并 JSON；macOS 上 JXA 排在 Python 前，
  # 避免没装命令行工具时 /usr/bin/python3 弹出安装窗口
  if tf_have node; then
    tf_merge_settings_node || tf_die "$invalid"
  elif [ "$(uname -s)" = Darwin ]; then
    tf_merge_settings_jxa || tf_die "$invalid"
  elif tf_have python3; then
    tf_merge_settings_python || tf_die "$invalid"
  elif [ ! -s "$file" ]; then
    # 没有可用的 JSON 工具且文件不存在：直接写一份新文件（值里只可能有地址、密钥、模型名）
    printf '{\n  "env": {\n    "ANTHROPIC_BASE_URL": "%s",\n    "ANTHROPIC_AUTH_TOKEN": "%s",\n    "ANTHROPIC_MODEL": "%s"\n  }\n}\n' \
      "$TF_BASE_URL" "$TF_KEY" "$TF_MODEL" >"$file"
  else
    tf_die "未找到 node 或 python3，无法安全合并已有的 $file。请安装 python3 后重试，或按文档手动修改"
  fi
  unset TF_FILE
  chmod 600 "$file"
  tf_info "已写入 $file"
}

tf_info "$TF_SITE_NAME · Claude Code 一键配置"
tf_read_key
tf_fetch_models
tf_choose_model 'claude' ' Claude '
tf_ensure_tool claude 'curl -fsSL https://claude.ai/install.sh | bash' '@anthropic-ai/claude-code'
tf_write_claude_settings

printf '\n'
tf_info "配置完成：地址 $TF_BASE_URL，默认模型 $TF_MODEL"
tf_info "在项目目录运行 claude，输入 /status 确认 Anthropic base URL 为 $TF_BASE_URL"
if ! tf_have claude; then
  tf_warn "当前终端还找不到 claude 命令，请新开一个终端再运行"
fi
