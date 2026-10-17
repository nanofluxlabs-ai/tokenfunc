package logger

// 事件名常量。CLS 上按 event 字段聚合，集中定义杜绝拼写漂移。
// 与 tokensolo 的 CLS 字段保持同名，排障经验与 CQL 可直接复用
const (
	// 入口与中间件
	EventAuthFailed       = "auth_failed"
	EventRateLimited      = "rate_limited"
	EventDistributeFailed = "distribute_failed"
	EventPanic            = "panic"
	EventAccess           = "access"

	// 调度层（attempt_id={request_id}-att{N}）
	EventAttemptSelect        = "attempt_select"
	EventAttemptFailed        = "attempt_failed"
	EventAttemptSwitched      = "attempt_switched"
	EventAttemptAbortedBudget = "attempt_aborted_budget"

	// 上游请求层
	EventUpstreamRequest       = "upstream_request"
	EventUpstreamRequestFailed = "upstream_request_failed"
	EventUpstreamFirstByte     = "upstream_first_byte"
	EventTransportPlan         = "transport_plan"

	// 响应解析层（P0 核心：CRS opus overloaded 事故根因）
	EventStreamUpstreamError = "stream_upstream_error"
	EventStreamInterrupted   = "stream_interrupted"

	// 出站首字节（全链路时延：上游首帧→首次发客户端 = obf_ms 出站缓冲）
	// 详见 docs/report/2026-06-02-responses-first-byte-latency-rootcause.md
	EventClientFirstByte = "client_first_byte"

	// 计费审计
	EventBillingCommitted     = "billing_committed"
	EventBillingRefundStarted = "billing_refund_started"
	EventBillingRefundResult  = "billing_refund_result"
)

// 字段名常量。CLS 索引字段统一命名。
const (
	FieldRequestID   = "request_id"
	FieldAttemptID   = "attempt_id"
	FieldAttemptNo   = "attempt_no"
	FieldRetryCount  = "retry_count"
	FieldUserID      = "user_id"
	FieldTokenID     = "token_id"
	FieldTokenName   = "token_name"
	FieldTokenPrefix = "token_prefix"
	FieldGroup       = "group"
	FieldRoute       = "route"
	FieldMethod      = "method"
	FieldClientIP    = "client_ip"
	FieldUAHash      = "user_agent_hash"

	// 模型 & 流标识
	FieldModel          = "model"
	FieldModelRequested = "model_requested"
	FieldModelBilled    = "model_billed"
	FieldIsStream       = "is_stream"

	// channel & 上游
	FieldChannelID         = "channel_id"
	FieldChannelName       = "channel_name"
	FieldChannelType       = "channel_type"
	FieldChannelPriority   = "channel_priority"
	FieldChannelWeight     = "channel_weight"
	FieldChannelGroup      = "channel_group"
	FieldFinalChannelID    = "final_channel_id"
	FieldFinalChannelName  = "final_channel_name"
	FieldUpstreamAccountID = "upstream_account_id"
	FieldUpstreamEndpoint  = "upstream_endpoint_host"
	FieldFromChannelID     = "from_channel_id"
	FieldNextChannelID     = "next_channel_id"
	FieldSwitchReason      = "switch_reason"
	FieldExcludedChannels  = "excluded_channel_ids"
	FieldSelectedPoolSize  = "selected_from_pool_size"

	// 响应 & 错误
	FieldStatusCode         = "status_code"
	FieldUpstreamStatus     = "upstream_status"
	FieldErrorClass         = "error_class"
	FieldErrorPhase         = "error_phase"
	FieldErrorSubclass      = "error_subclass"
	FieldErrorMessage       = "error_message"
	FieldUpstreamRespBody   = "upstream_response_body"
	FieldUpstreamRespHdrs   = "upstream_response_headers"
	FieldUpstreamReqURL     = "upstream_request_url"
	FieldUpstreamReqMethod  = "upstream_request_method"
	FieldUpstreamTransport  = "upstream_request_transport"
	FieldUpstreamTimeoutMs  = "upstream_request_timeout_ms"
	FieldFirstByteTimeoutMs = "upstream_first_byte_timeout_ms"
	FieldFirstByteWaitedMs  = "upstream_first_byte_waited_ms"
	FieldRequestBodySize    = "request_body_size"

	// 流式
	FieldStreamEventSeq      = "stream_event_seq"
	FieldStreamEventSeqAtErr = "stream_event_seq_at_error"
	FieldBytesReceived       = "bytes_received"
	FieldEventsReceived      = "events_received"
	FieldLastEventSeq        = "last_event_seq"
	FieldLastSSEEventAt      = "last_sse_event_at"
	FieldTimeSinceLastEvent  = "time_since_last_event_ms"
	FieldIsCleanEOF          = "is_clean_eof"
	FieldDisconnectSource    = "disconnect_source"
	FieldClientContextErr    = "client_context_err"

	// 时延 & 预算
	FieldTotalMs           = "total_ms"
	FieldDurationMs        = "duration_ms"
	FieldTTFBMs            = "ttfb_ms"
	FieldBackoffMs         = "backoff_ms"
	FieldBudgetConsumedMs  = "budget_consumed_ms"
	FieldBudgetRemainingMs = "budget_remaining_ms"

	// 全链路时延分段（详见 docs/report/2026-06-02-responses-first-byte-latency-rootcause.md）
	FieldUploadMs     = "upload_ms"     // 入口→body读完（纯入站上传，不含选渠道）
	FieldRouteMs      = "route_ms"      // body读完→选完渠道（模型解析/选渠道/DB）
	FieldPreprocessMs = "preprocess_ms" // 读完body→发上游（含请求转换/build）
	FieldPrefillMs    = "prefill_ms"    // 上游响应头→首data帧（上游思考）
	FieldObfMs        = "obf_ms"        // 首data帧→首次发客户端（出站缓冲）

	// 限流
	FieldLimitDim     = "limit_dim"
	FieldLimitWindowS = "limit_window_s"
	FieldLimitQuota   = "limit_quota"
	FieldCurrentCount = "current_count"

	// 计费
	FieldQuotaConsumed    = "quota_consumed"
	FieldPromptTokens     = "prompt_tokens"
	FieldCompletionTokens = "completion_tokens"
	FieldBillingStatus    = "billing_status"
	FieldRefundStatus     = "refund_status"
	FieldRefundReason     = "refund_reason"

	// 同账号重试（盲区 3）
	FieldSameChannelRetriesUsed = "same_channel_retries_used"
	FieldSameChannelRetriesMax  = "same_channel_retries_max"

	// auth/distribute/rate-limit 细分原因
	FieldReason                     = "reason"
	FieldFilterReasons              = "filter_reasons"
	FieldCandidateCountBeforeFilter = "candidate_count_before_filter"

	// panic 上下文（盲区：现状只有堆栈）
	FieldStackTrace       = "stack_trace"
	FieldCurrentChannelID = "current_channel_id"
	FieldCurrentAttemptNo = "current_attempt_no"
)

// error_phase 枚举（卡点分阶段）
const (
	ErrorPhaseAuth         = "auth"
	ErrorPhaseDistribute   = "distribute"
	ErrorPhaseBuildRequest = "build_request"
	ErrorPhaseDial         = "dial"
	ErrorPhaseTLS          = "tls"
	ErrorPhaseFirstByte    = "first_byte"
	ErrorPhaseStreamRead   = "stream_read"
	ErrorPhaseStreamDecode = "stream_decode"
	ErrorPhaseBilling      = "billing"
)

// error_subclass 枚举（错误细分）
const (
	ErrorSubclassDNSLookup        = "dns_lookup"
	ErrorSubclassTCPDial          = "tcp_dial"
	ErrorSubclassTLSHandshake     = "tls_handshake"
	ErrorSubclassConnectTimeout   = "connect_timeout"
	ErrorSubclassFirstByteTimeout = "first_byte_timeout"
	ErrorSubclassReadTimeout      = "read_timeout"
	ErrorSubclassResetByPeer      = "reset_by_peer"
	ErrorSubclassHTTP2Goaway      = "http2_goaway"
	ErrorSubclassUpstream5xx      = "upstream_5xx"
	ErrorSubclassUpstream429      = "upstream_429"
	ErrorSubclassUpstream4xx      = "upstream_4xx"
)

// disconnect_source 枚举（流断来源归因，盲区 1）
const (
	DisconnectSourceClient        = "client"
	DisconnectSourceGatewayCancel = "gateway_cancel"
	DisconnectSourceGatewayBudget = "gateway_budget"
	DisconnectSourceUpstreamReset = "upstream_reset"
	DisconnectSourceUpstreamEOF   = "upstream_eof"
)

// switch_reason 枚举（failover 切换原因）
const (
	SwitchReasonRetry       = "retry"
	SwitchReasonRateLimited = "rate_limited"
	SwitchReason5xx         = "upstream_5xx"
	SwitchReasonTimeout     = "timeout"
	SwitchReasonExhausted   = "exhausted"
	SwitchReasonInvalidKey  = "invalid_key"
	// SwitchReasonChannelAnyError 渠道级「任何错误都重试」开关触发的换渠道（含客户端侧 4xx）。
	SwitchReasonChannelAnyError = "channel_any_error"
)

// billing_status / refund_status 枚举
const (
	BillingStatusSuccess      = "success"
	BillingStatusRefunded     = "refunded"
	BillingStatusRefundFailed = "refund_failed"

	RefundStatusSuccess = "success"
	RefundStatusFailed  = "failed"
)

// gin.Context 共享 key 常量。供 controller / relay / middleware 跨包读取 attempt 上下文。
const (
	CtxKeyAttemptID    = "log_attempt_id"
	CtxKeyAttemptNo    = "log_attempt_no"
	CtxKeyAttemptStart = "log_attempt_start_time"
)

// limit_dim 枚举（限流维度）
const (
	LimitDimUser    = "user"
	LimitDimToken   = "token"
	LimitDimModel   = "model"
	LimitDimChannel = "channel"
	LimitDimGroup   = "group"
)
