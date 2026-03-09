
# 项目优化清单

基于对整个代码库的深度审查，共发现 32 项可优化点，按优先级排列如下。

---

## P0 — 安全（必须立即修复）

| # | 问题 | 关键文件 | 说明 |
|---|------|----------|------|
| 1 | **API 无认证** | `app/api/meta/route.ts`, 所有 `/api/*` | 任何人可触发 Meta Pipeline，执行命令、写文件、git 操作 |
| 2 | **命令注入风险** | `lib/tools/run-command.ts` | LLM 控制输入，若被 prompt injection 可执行任意命令 |
| 3 | **Supabase Service Role Key 暴露** | `lib/db/client.ts:15-18` | 缺少 `import 'server-only'`，key 可能泄漏到客户端 |
| 4 | **无 CORS/CSP 头** | API routes, `next.config.js` | 缺少跨域和内容安全策略 |
| 5 | **外部 URL 无验证** | Signal 采集链路 | SSRF 攻击风险 |

---

## P1 — 稳定性与可靠性

| # | 问题 | 关键文件 | 说明 |
|---|------|----------|------|
| 6 | **ReAct 循环消息无上限** | `lib/core/base-agent.ts:101-226` | Architect 30轮循环，每轮重传全部历史，token 浪费严重且可能撞 context limit |
| 7 | **LLM API 调用无超时** | `lib/core/base-agent.ts:104` | API 挂起将阻塞整个流水线 |
| 8 | **Agent/Skill 注册表内存泄漏** | `lib/tools/spawn-agent.ts:15`, `create-agent.ts:29` | Map 只增不减，长期运行 OOM |
| 9 | **SSE 无心跳** | `app/api/meta/route.ts:34` | 10-30分钟流水线，代理/LB 会断开空闲连接 |
| 10 | **LLM 输出无 Zod 校验** | `lib/skills/prepare.ts` | 直接 `as DecisionOutput` 强转，字段缺失时 undefined |
| 11 | **关键步骤静默失败** | `lib/skills/prepare.ts:144-200` | 竞品分析失败后用空字符串替代，决策质量下降 |
| 12 | **MessageBus 单例跨请求** | `connectors/bus/message-bus.ts:130` | Next.js serverless 下并发请求消息混淆 |
| 13 | **Serverless 超时不兼容** | `app/api/meta/route.ts` | Meta Pipeline 需 10-30 分钟，Vercel 默认超时 10s |

---

## P2 — 性能

| # | 问题 | 关键文件 | 说明 |
|---|------|----------|------|
| 14 | **OpenAI Client 每次调用重建** | `lib/core/llm.ts:100` | 应使用单例 |
| 15 | **Zod→JSON Schema 重复转换** | `lib/core/base-tool.ts:26-37` | 10工具×30轮=300次，应缓存 |
| 16 | **前端 bundle 无分析** | `package.json` | `recharts`, `framer-motion`, `lucide-react` 较重，缺少懒加载 |
| 17 | **数据库缺索引** | `database/schema.sql` | `signals.status`, `decisions.signal_id`, `tasks.status` 无索引 |
| 18 | **无连接池** | `lib/db/client.ts` | 每请求创建新连接 |

---

## P3 — 代码质量 & DX

| # | 问题 | 关键文件 | 说明 |
|---|------|----------|------|
| 19 | **SSE 响应函数重复** | `meta/route.ts`, `analyze/route.ts` | `makeSSEResponse()` 完全相同 |
| 20 | **TypeScript 类型退化** | `lib/core/types.ts` | `AgentContext` 有 `[key: string]: any`；`ToolExecutionResult` 允许非法状态 |
| 21 | **零测试覆盖** | 全项目 | 15个 agent、34个 tool、5条流水线，无任何自动化测试 |
| 22 | **无可观测性** | `lib/core/types.ts` | `traceId` 定义了但从未使用，无结构化日志 |
| 23 | **无成本追踪** | — | 不知道每条流水线消耗了多少 LLM token / 花费 |
| 24 | **`cleanJSON` 贪婪匹配** | `lib/core/llm.ts:234` | 正则可能匹配到错误的 JSON 边界 |

---

## 快速修复建议（优先做这 5 件事）

1. **加 API 认证中间件** — 堵住所有安全漏洞入口
2. **消息滑动窗口** — `base-agent.ts` 中保留 system + 最近 N 条消息，解决 token 爆炸
3. **Agent 输出加 Zod 校验** — 防止静默失败
4. **提取共享 SSE 工具函数** — 消除重复代码
5. **加测试框架** — Jest + 核心函数单元测试

---

## 修复记录

| # | 状态 | 修复说明 |
|---|------|----------|
| 6 | - [x] | 已修复：在 `lib/core/base-agent.ts` 中添加 `trimMessages()` 滑动窗口函数，API 调用前自动裁剪历史消息至最近 40 条，保留 system + 初始 user message + 摘要注释，且不拆分 tool_call/tool 配对 |
| 7 | - [x] | 已修复：在 `lib/core/base-agent.ts` 的 `createCompletionWithFailover()` 两处 `.create()` 调用中添加 `{ timeout: 120_000 }`（2 分钟超时），防止 API 挂起阻塞整条流水线 |
| 8 | - [x] | 已修复：(1) `spawn-agent.ts` 新增 `deregisterAgentFactory()`；(2) `agent-registry.ts` 新增 `deregisterAgent()`；(3) `create-agent.ts` 的 `removeDynamicAgent()` 现在同时清理全部三个注册表；(4) 新增 TTL（1小时）+ 最大容量（50）自动淘汰机制 `evictStaleDynamicAgents()`，在创建新 agent 前自动执行 |
| 9 | - [x] | 已修复：在 `lib/utils/api-error.ts` 的 `makeSSEResponse()` 中添加 30 秒心跳，定时发送 `{ type: "heartbeat", ts }` 保持连接活跃，在流结束或连接关闭时自动清除 interval |
| 10 | - [x] | 已修复：在 `lib/skills/prepare.ts` 中新增 `BlueTeamOutputSchema` 和 `ArbitratorOutputSchema` Zod 校验。Blue Team 输出经 `safeParse()` 验证字段类型/结构，不合格时记录具体 issues 到日志。Arbitrator 输出验证失败时 `decision` 安全降级为 `CIRCUIT_BREAK` |
| 11 | - [x] | 已修复：在 `lib/skills/prepare.ts` 中新增 `stageFailures` 追踪数组。Researcher 失败 → 向 Blue Team 注入数据缺失警告；Red Team 失败 → 记录；所有失败汇总后注入 Arbitrator 提示词，要求其在数据不完整时降低置信度并倾向 CIRCUIT_BREAK |
| 12 | - [x] | 已修复：`app/api/meta/route.ts` 和 `app/api/analyze/route.ts` 的所有 SSE 流式阶段现在均使用 `messageBus.withScope({ sessionId: crypto.randomUUID() })` 包裹，通过 AsyncLocalStorage 隔离并发请求的消息链路，防止跨请求数据泄漏 |
| 13 | - [x] | 已修复：(1) 两个路由均导出 `maxDuration = 300` 请求 Vercel Pro 最大 5 分钟超时；(2) `makeSSEResponse` 新增 `SSEOptions { timeoutMs, signal }` 参数，内置 280s 软超时（`Promise.race`）在 Vercel 硬杀前发送优雅错误；(3) 监听 `req.signal` 检测客户端断连，断连后停止写入 |
| 14 | - [x] | 已修复：在 `lib/core/llm.ts` 新增模块级 `_clientCache: Map<string, OpenAI>`，`getCachedClient()` 按 `apiKey+baseUrl` 缓存 OpenAI 实例。`generateJSON` 的 apiKey 路径改用 `getCachedClient()` 代替 `createOpenAIClient()`，相同凭据不再重复创建 |
| 15 | - [x] | 已修复：在 `lib/core/base-tool.ts` 的 `BaseTool` 类新增 `_cachedFunctionDef` 私有字段。`toFunctionDef()` 首次调用时执行 `zodToJsonSchema` 并缓存结果，后续调用直接返回缓存，消除重复转换开销 |
| 16 | - [x] | 已修复：(1) 新增 `@next/bundle-analyzer` devDep + `build:analyze` 脚本 + `next.config.js` 集成（`ANALYZE=true` 时启用）；(2) `UsageSnapshotCard`（含 recharts）改为 `next/dynamic` 懒加载（`ssr: false`），仅在 settings 页切到 usage tab 时才加载 recharts 包 |
| 17 | - [x] | 已修复：(1) 新增迁移文件 `database/migrations/017_add_missing_indexes.sql`；(2) 在 `database/schema.sql` 基础 schema 中添加 4 个索引：`idx_signals_status`、`idx_decisions_signal_id`、`idx_tasks_status`、`idx_tasks_decision_id` |
| 18 | - [x] | 已修复：`lib/db/client.ts` 改用 `globalThis` 单例模式，跨热重载和 serverless warm start 复用同一 SupabaseClient 实例；新增 `SERVER_CLIENT_OPTIONS`（`persistSession: false`, `autoRefreshToken: false`）消除 server 端无意义的 session 管理开销；`reinitializeSupabase()` 同步更新 globalThis 缓存 |
| 19 | - [x] | 无需修复：当前代码中 `makeSSEResponse` 已提取到 `lib/utils/api-error.ts` 共享工具函数，`meta/route.ts` 和 `analyze/route.ts` 均从该模块导入，不存在重复 |
| 20 | - [x] | 已修复：(1) `AgentContext` 移除 `[key: string]: any` 索引签名，经全代码库扫描确认仅使用 `signalId`、`projectId`、`logger`、`recordUsage` 四个已声明属性，无任何动态属性访问；(2) `ToolExecutionResult` 从 `{ success: boolean; data?: any; error?: string }` 转为判别联合 `{ success: true; data: unknown } | { success: false; error: string }`，禁止非法状态（如 `success: true` 但无 data）。0 编译错误 |
| 21 | - [x] | 已修复：(1) 新增 `jest`、`ts-jest`、`@types/jest` devDeps；(2) `package.json` 添加 `test` / `test:watch` 脚本；(3) 新增 `jest.config.js` 配置（ts-jest preset、`@/` 路径别名映射）；(4) 编写 3 个测试套件 22 个用例覆盖核心模块：`cleanJSON`（8 case）、`isReasonerModel`（4 case）、`BaseTool.execute`（3 case）、`BaseTool.toFunctionDef`（2 case + 缓存验证）、`ToolExecutionResult` 判别联合（3 case）、`AgentContext` 类型安全（2 case）。全部通过 |
| 22 | - [x] | 已修复：(1) 新增 `lib/utils/logger.ts` 结构化日志模块，输出 JSON 格式日志（含 `ts`/`level`/`traceId`/`agent`/`msg` + 扩展字段），按级别路由到 `console.log`/`warn`/`error`；(2) 新增 `generateTraceId()` 生成 `tr-{timestamp36}-{random}` 格式唯一追踪 ID；(3) `BaseAgent.run()` 和 `runOnce()` 自动生成 traceId（优先使用 `context.traceId`），通过结构化 logger 记录生命周期事件（completion、token 统计）；(4) `MessageScope` 新增 `traceId` 字段用于消息总线关联；(5) `recordLlmUsage` 新增 `traceId` 参数，写入 `llm_usage` 表。新增 6 个测试用例验证 logger 和 traceId 生成。36/36 测试全部通过 |
| 23 | - [x] | 已修复：(1) 新增 `lib/config/model-pricing.ts` 模型定价配置（覆盖 gpt-4o/4o-mini/4-turbo/4/3.5-turbo/deepseek-chat/deepseek-reasoner），`calculateCostUsd()` 支持精确匹配和前缀匹配（如 `gpt-4o-2024-08-06` → `gpt-4o`）；(2) 新增迁移 `018_add_usage_cost_tracking.sql`，`llm_usage` 表增加 `signal_id`（FK→signals）、`trace_id`、`cost_usd` 三列及对应索引；(3) `recordLlmUsage` 扩展接受 `signalId`/`traceId` 参数，自动调用 `calculateCostUsd()` 计算费用写入 DB；(4) `generateJSON` 签名扩展 `signalId`/`traceId` 透传；(5) `BaseAgent` 两处 `recordLlmUsage` 调用传入 `signalId`/`traceId`；(6) `/api/usage` 响应新增 `costUsd` 字段（7d/30d 总计、按 agent、按 account、信号/项目阶段分别统计）。新增 8 个测试用例验证定价计算。36/36 测试全部通过 |
| 24 | - [x] | 已修复：将 `cleanJSON` 中贪婪正则 `/\{[\s\S]*\}/` 替换为平衡花括号扫描算法 `extractFirstJsonObject()`。新算法从第一个 `{` 开始逐字符计数 depth，遇到 `}` 且 depth 归零时截断，正确处理 JSON 字符串内的花括号和转义引号。当花括号不平衡时回退到贪婪匹配保持兼容。新增 10 个测试用例覆盖：多 JSON 对象分离、尾部花括号文本、字符串内花括号、转义引号、深层嵌套、无花括号输入。46/46 测试全部通过 |
| 3 | - [x] | 已修复：`lib/db/client.ts` 顶部添加 `import 'server-only'`，安装 `server-only` 包。Next.js 构建时若任何客户端组件（`'use client'`）直接或间接引入此模块，将立即报错阻止构建，防止 `SUPABASE_SERVICE_ROLE_KEY` 泄漏到浏览器。Jest 测试中通过 `moduleNameMapper` mock 该模块避免误报 |
| 5 | - [x] | 已修复：(1) 新增 `lib/utils/url-validator.ts` SSRF 防护模块，`validateExternalUrl()` 拦截私有 IP（127.x/10.x/172.16-31.x/192.168.x）、link-local（169.254.x — AWS/Azure/GCP 元数据端点）、`metadata.google.internal`、`kubernetes.default`、非 HTTP 协议、嵌入凭据的 URL；(2) `filterSafeUrls()` 批量过滤 + 审计日志；(3) `connectors/external/firecrawl.ts` 三处集成：`crawlViaOfficialEndpoint()` 发送前过滤、`crawl4aiSearch()` 直接 URL 查询校验、`extractUrlsFromMarkdown()` 搜索结果 URL 校验。新增 18 个测试用例覆盖所有拦截场景。64/64 测试全部通过 |
