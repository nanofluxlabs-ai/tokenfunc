package ratio_setting

// TokenFunc 二开：用户分组定价页需要整张「用户分组 → 渠道分组 → 倍率」矩阵的副本来做切片更新；
// 上游只暴露单格读取，这里补一个只读副本，不改上游文件。

// GetGroupGroupRatioCopy 返回 GroupGroupRatio 的深拷贝
func GetGroupGroupRatioCopy() map[string]map[string]float64 {
	src := groupGroupRatioMap.ReadAll()
	out := make(map[string]map[string]float64, len(src))
	for userGroup, ratios := range src {
		inner := make(map[string]float64, len(ratios))
		for usingGroup, ratio := range ratios {
			inner[usingGroup] = ratio
		}
		out[userGroup] = inner
	}
	return out
}
