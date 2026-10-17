package common

import _ "embed"

// tokenfunc 二开的服务端日志中文文案，覆盖或补充上游 log_text.zh-CN.json；
// 由 SetLogLanguage 在加载上游表之后合并，同 key 以本文件为准。
//
//go:embed log_text.tokenfunc.zh-CN.json
var logTextTokenfuncZhCN []byte

func applyTokenfuncLogTexts() {
	var overrides map[string]string
	if err := Unmarshal(logTextTokenfuncZhCN, &overrides); err != nil {
		return
	}
	if logTexts == nil {
		logTexts = make(map[string]string, len(overrides))
	}
	for key, text := range overrides {
		logTexts[key] = text
	}
}
