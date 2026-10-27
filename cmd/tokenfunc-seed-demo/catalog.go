package main

// 示例数据的静态目录：模型、渠道、账号画像。数值只为让图表有层次，不代表真实价格。

// demoUsernamePrefix 所有示例账号（企业主、个人用户、推广人）的用户名前缀，清理时据此识别
const demoUsernamePrefix = "demo_"

// demoChannelPrefix 示例渠道名前缀
const demoChannelPrefix = "demo-"

// demoLeadEmailSuffix 示例试用线索联系方式后缀
const demoLeadEmailSuffix = "@demo.tokenfunc.local"

// demoPassword 示例账号统一登录密码（只用于本地 dev schema）
const demoPassword = "Demo@123456"

// demoNodeName quota_data 的节点维度
const demoNodeName = "tokenfunc-demo"

type modelSpec struct {
	Name            string
	Ratio           float64 // 模型倍率：quota = tokens × ratio × group_ratio
	CompletionRatio float64
	CacheRatio      float64 // 0 表示该模型不走缓存
	PromptMean      int
	CompletionMean  int
	OutputTPS       float64 // 输出速度，决定耗时
	Channel         string  // 渠道 key，对应 demoChannels
	RequestPath     string
}

var demoModels = []modelSpec{
	{Name: "claude-opus-5", Ratio: 2.5, CompletionRatio: 5, CacheRatio: 0.1, PromptMean: 6400, CompletionMean: 900, OutputTPS: 45, Channel: "anthropic", RequestPath: "/v1/messages"},
	{Name: "claude-sonnet-5", Ratio: 1.5, CompletionRatio: 5, CacheRatio: 0.1, PromptMean: 5200, CompletionMean: 720, OutputTPS: 62, Channel: "anthropic", RequestPath: "/v1/messages"},
	{Name: "gpt-5", Ratio: 0.625, CompletionRatio: 8, CacheRatio: 0.1, PromptMean: 3800, CompletionMean: 640, OutputTPS: 75, Channel: "openai", RequestPath: "/v1/chat/completions"},
	{Name: "gemini-3-pro", Ratio: 1.0, CompletionRatio: 6, CacheRatio: 0.25, PromptMean: 4600, CompletionMean: 580, OutputTPS: 90, Channel: "multi", RequestPath: "/v1/chat/completions"},
	{Name: "deepseek-v4", Ratio: 0.14, CompletionRatio: 4, CacheRatio: 0.1, PromptMean: 3000, CompletionMean: 820, OutputTPS: 48, Channel: "multi", RequestPath: "/v1/chat/completions"},
	{Name: "qwen3-max", Ratio: 0.6, CompletionRatio: 4, CacheRatio: 0.2, PromptMean: 2600, CompletionMean: 520, OutputTPS: 70, Channel: "multi", RequestPath: "/v1/chat/completions"},
	{Name: "gpt-5-mini", Ratio: 0.125, CompletionRatio: 8, CacheRatio: 0.1, PromptMean: 1800, CompletionMean: 360, OutputTPS: 140, Channel: "openai", RequestPath: "/v1/chat/completions"},
	{Name: "claude-haiku-4-5", Ratio: 0.5, CompletionRatio: 5, CacheRatio: 0.1, PromptMean: 2200, CompletionMean: 420, OutputTPS: 120, Channel: "anthropic", RequestPath: "/v1/messages"},
}

type channelSpec struct {
	Key    string
	Name   string
	Models []string
}

// 渠道都指向本地 mock 上游（.tmp/mock_upstream.py :3999），真实请求也能跑通
var demoChannels = []channelSpec{
	{Key: "openai", Name: demoChannelPrefix + "openai", Models: []string{"gpt-5", "gpt-5-mini"}},
	{Key: "anthropic", Name: demoChannelPrefix + "anthropic", Models: []string{"claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"}},
	{Key: "multi", Name: demoChannelPrefix + "multi", Models: []string{"gemini-3-pro", "deepseek-v4", "qwen3-max"}},
}

const demoChannelBaseURL = "http://127.0.0.1:3999"

func demoModelNames() []string {
	names := make([]string, 0, len(demoModels))
	for _, spec := range demoModels {
		names = append(names, spec.Name)
	}
	return names
}

func findModel(name string) *modelSpec {
	for i := range demoModels {
		if demoModels[i].Name == name {
			return &demoModels[i]
		}
	}
	panic("unknown demo model: " + name)
}

// modelMix 按权重给出模型组合；长尾让环图出现「其他」
type modelMix map[string]float64

var (
	mixCoding = modelMix{"claude-opus-5": 16, "claude-sonnet-5": 38, "gpt-5": 18, "gemini-3-pro": 12, "claude-haiku-4-5": 8, "deepseek-v4": 6, "gpt-5-mini": 5, "qwen3-max": 3}
	mixApp    = modelMix{"gpt-5-mini": 34, "deepseek-v4": 22, "qwen3-max": 16, "gpt-5": 12, "claude-haiku-4-5": 9, "gemini-3-pro": 5, "claude-sonnet-5": 2}
	mixMixed  = modelMix{"gpt-5": 28, "claude-sonnet-5": 20, "claude-opus-5": 4, "gemini-3-pro": 16, "deepseek-v4": 12, "gpt-5-mini": 10, "qwen3-max": 7, "claude-haiku-4-5": 5}
	mixLight  = modelMix{"deepseek-v4": 40, "gpt-5-mini": 30, "qwen3-max": 20, "gpt-5": 10}
)

// 企业成员花名册：姓名、英文名（邮箱前缀）
var demoPeople = []struct{ Name, Email string }{
	{"张伟", "zhang.wei"}, {"王芳", "wang.fang"}, {"李娜", "li.na"}, {"刘洋", "liu.yang"}, {"陈静", "chen.jing"},
	{"杨帆", "yang.fan"}, {"赵磊", "zhao.lei"}, {"黄敏", "huang.min"}, {"周杰", "zhou.jie"}, {"吴婷", "wu.ting"},
	{"徐强", "xu.qiang"}, {"孙丽", "sun.li"}, {"马超", "ma.chao"}, {"朱琳", "zhu.lin"}, {"胡军", "hu.jun"},
	{"郭峰", "guo.feng"}, {"何雪", "he.xue"}, {"高翔", "gao.xiang"}, {"林涛", "lin.tao"}, {"罗佳", "luo.jia"},
	{"梁宇", "liang.yu"}, {"宋雨", "song.yu"}, {"郑浩", "zheng.hao"}, {"谢颖", "xie.ying"}, {"韩冰", "han.bing"},
	{"唐鑫", "tang.xin"}, {"冯晨", "feng.chen"}, {"董蕾", "dong.lei"}, {"程飞", "cheng.fei"}, {"曹阳", "cao.yang"},
	{"彭博", "peng.bo"}, {"潘悦", "pan.yue"}, {"蒋文", "jiang.wen"}, {"蔡琪", "cai.qi"},
}
