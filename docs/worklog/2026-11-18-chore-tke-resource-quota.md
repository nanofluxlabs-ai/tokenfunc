# TKE 资源配额重排：网关 slave 扩到 3 副本，crs 调大，codex2api 收回

- 日期：2026-11-18
- 分支：main
- PR：
- 关键 commit：

## 背景

网关是全部流量的入口，slave 原来只有 2 副本，每个 200m / 256Mi，没有 PDB。用户要求：slave 3 副本并加大配额，不浪费集群资源，网关不能成为瓶颈。

已定约束：
- 集群固定 3 台 SA9.LARGE8，节点池不开自动伸缩。
- 网关固定 3 副本，不加 HPA。
- 其他服务申请过多的一起收回。
- crs 是核心号池，CPU limit 给到 2 核；codex2api 流量小，limit 可以低。

## 变更

| 工作负载 | requests（每个） | limits（每个） |
|---|---|---|
| tokenfunc-api-slave（2→3 副本） | 200m/256Mi → 800m/1Gi | 1/2Gi → 2 核/2Gi，`GOMEMLIMIT=1800MiB`，新增 PDB minAvailable 2 |
| tokenfunc-api-master | 100m/256Mi → 250m/512Mi | 1 核/1Gi 不变，`GOMEMLIMIT=900MiB` |
| tokenfunc-codex2api（另一仓库） | 500m/768Mi → 100m/512Mi | 4 核 → 1 核，内存 2Gi 不变 |
| tokenfunc-crs（另一仓库） | 300m/256Mi → 500m/512Mi | 1 核/1Gi → 2 核/2Gi |

容量原则：没有自动伸缩，HA 的底线是**任意一台节点宕机后，剩下 2 台仍装得下全部 Pod**。
- 核算时要先扣掉 DaemonSet：每台约 450m / 320Mi，它们不用迁移。
- 宕一台后剩余可用：2 ×（3920 − 450）= 6940m。
- 非 DaemonSet requests 合计 6750m，所以 slave 不能给到 1 核（那样会到 7350m）。
- 以后再加 request 就要先加节点。

## 验证

- 用 `kubectl patch --type strategic` 逐个修改，没有 apply 整个文件，前后对比镜像 tag 完全一致。顺序：codex2api → crs → master → slave。全部 rollout 成功。
- slave 3/3，三台节点各一个；PDB ALLOWED DISRUPTIONS = 1。
- 节点 requests：CPU 57% / 66% / 82%，内存 47% / 56% / 54%；集群整体 8100m（69%）/ 9.2Gi（53%）。宕一台核算：6750m ≤ 6940m，内存 8.3Gi ≤ 11.0Gi。
- CLS 查 ingress：滚动期间无 5xx。
  - 本机探测 `/api/health/ready` 出现过 2 次 000，但 ingress 没有对应请求，判断为本机网络问题。
  - 事后前台连续探测 90 次，全部 200。
- 冒烟：glm-5.3-flash、kimi-k2.7-code 非流式 200，流式正常。

## 遗留

- 余量只剩约 190m。crs / 网关扩副本，或 codex2api 导入账号上量之前，要先加节点。
- codex2api 的 requests 是按「无账号」压低的，上量后按 P95 调回。
