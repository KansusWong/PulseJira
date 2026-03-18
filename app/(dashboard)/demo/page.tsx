"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ChatInput } from "@/components/chat/ChatInput";
import { TeamStatusBar } from "@/components/chat/team/TeamStatusBar";
import { AgentLaneGrid } from "@/components/chat/team/AgentLaneGrid";
import type { ChatMessage, AgentStatus, StructuredAgentStep, AgentMailMessage } from "@/lib/core/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MateChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface TimelineEntry {
  delay: number;
  agents?: AgentStatus[];
  step?: StructuredAgentStep;
  comm?: AgentMailMessage;
  message?: ChatMessage;
  /** Set streaming content for agents (key = agent name) */
  mateStreaming?: Record<string, string>;
  /** Add completed chat messages for agents, also clears their streaming buffer */
  mateMsgs?: Array<{ agent: string; role: "assistant"; content: string }>;
}

// ---------------------------------------------------------------------------
// Markdown content fragments (Chinese)
// ---------------------------------------------------------------------------

const PLANNER_STREAM_1 =
`## 通知系统数据模型

正在分析现有代码结构，设计三个核心模型...`;

const PLANNER_STREAM_2 =
`## 通知系统数据模型

需要设计三个核心模型：

- **Notification** — 通知主体
- **Channel** — 推送渠道配置
- **Preference** — 用户偏好设置

正在编写 TypeScript 类型定义...`;

const PLANNER_STREAM_3 =
`## 通知系统数据模型

设计了三个核心模型：

\`\`\`typescript
interface Notification {
  id: string;
  userId: string;
  channel: 'email' | 'push' | 'in_app';
  title: string;
  body: string;
  status: 'pending' | 'sent' | 'failed';
  createdAt: Date;
}
\`\`\`

正在补充 Channel 和 Preference 模型...`;

const PLANNER_FINAL =
`## 数据模型设计完成

设计了三个核心模型：

\`\`\`typescript
interface Notification {
  id: string;
  userId: string;
  channel: 'email' | 'push' | 'in_app';
  title: string;
  body: string;
  status: 'pending' | 'sent' | 'failed';
  createdAt: Date;
}

interface Channel {
  id: string;
  type: 'email' | 'push' | 'in_app';
  config: Record<string, unknown>;
  enabled: boolean;
}

interface Preference {
  userId: string;
  channels: Record<string, boolean>;
  quietHours?: { start: string; end: string };
}
\`\`\`

**关键设计决策**：
- 使用 \`channel\` 枚举区分推送渠道
- \`Preference\` 模型支持静默时段配置
- \`status\` 字段追踪发送状态，便于重试逻辑`;

const DEV_STREAM_1 =
`## REST API 端点设计

正在规划 4 个核心端点...`;

const DEV_STREAM_2 =
`## REST API 端点实现

| 方法 | 路径 | 说明 |
|------|------|------|
| \`POST\` | \`/api/notifications\` | 创建通知 |
| \`GET\` | \`/api/notifications/:id\` | 查询通知 |
| \`PATCH\` | \`/api/notifications/:id/read\` | 标记已读 |
| \`GET\` | \`/api/notifications/user/:userId\` | 用户通知列表 |

正在编写路由代码...`;

const DEV_STREAM_3 =
`## REST API 端点实现

| 方法 | 路径 | 说明 |
|------|------|------|
| \`POST\` | \`/api/notifications\` | 创建通知 |
| \`GET\` | \`/api/notifications/:id\` | 查询通知 |
| \`PATCH\` | \`/api/notifications/:id/read\` | 标记已读 |
| \`GET\` | \`/api/notifications/user/:userId\` | 用户通知列表 |

\`\`\`typescript
export async function POST(req: Request) {
  const { userId, channel, title, body } = await req.json();

  const notification = await db.notification.create({
    data: { userId, channel, title, body, status: 'pending' }
  });

  await queue.add('send-notification', {
    id: notification.id
  });

  return NextResponse.json(notification, { status: 201 });
}
\`\`\`

正在编写测试用例...`;

const DEV_FINAL =
`## API 实现完成

实现了 4 个 REST 端点：

| 方法 | 路径 | 说明 |
|------|------|------|
| \`POST\` | \`/api/notifications\` | 创建通知 |
| \`GET\` | \`/api/notifications/:id\` | 查询通知 |
| \`PATCH\` | \`/api/notifications/:id/read\` | 标记已读 |
| \`GET\` | \`/api/notifications/user/:userId\` | 用户通知列表 |

核心路由代码：

\`\`\`typescript
export async function POST(req: Request) {
  const { userId, channel, title, body } = await req.json();

  const notification = await db.notification.create({
    data: { userId, channel, title, body, status: 'pending' }
  });

  await queue.add('send-notification', { id: notification.id });
  return NextResponse.json(notification, { status: 201 });
}
\`\`\`

**测试结果**：6 个测试全部通过`;

const DEPLOYER_STREAM_1 =
`## 部署配置

正在规划 Kubernetes 部署方案...`;

const DEPLOYER_STREAM_2 =
`## 部署配置

### Kubernetes Manifest

\`\`\`yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notification-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: notification
  template:
    spec:
      containers:
      - name: notification
        image: registry/notification:latest
        ports:
        - containerPort: 3000
\`\`\`

正在补充 Service、Ingress 和 CI/CD 配置...`;

const DEPLOYER_FINAL =
`## 部署配置完成

### Kubernetes Manifest

\`\`\`yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notification-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: notification
  template:
    spec:
      containers:
      - name: notification
        image: registry/notification:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
\`\`\`

**包含组件**：
- Kubernetes Deployment（3 副本）
- Service + Ingress 配置
- CI/CD Pipeline（GitHub Actions）
- 自动扩缩容 HPA 配置`;

const REBUILD_STREAM_1 =
`正在分析用户需求，制定执行计划...`;

const REBUILD_FINAL =
`**任务分析完成**，制定了三阶段执行计划：

1. **数据模型设计** → 分配给 Planner
2. **API 端点实现** → 分配给 Developer
3. **部署配置** → 分配给 Deployer

各模块可并行推进，按顺序交付。`;

// ---------------------------------------------------------------------------
// Scripted timeline
// ---------------------------------------------------------------------------

const BASE = Date.now();

const TIMELINE: TimelineEntry[] = [
  // ── 0s: Team Lead starts ──
  {
    delay: 0,
    agents: [
      { name: "rebuild", status: "working", current_task: "分析任务，制定计划" },
      { name: "planner", status: "idle" },
      { name: "developer", status: "idle" },
      { name: "deployer", status: "idle" },
    ],
    step: {
      id: "s1", agent: "rebuild", kind: "thinking",
      message: "分析用户需求：构建通知系统...",
      timestamp: BASE,
    },
    mateStreaming: { rebuild: REBUILD_STREAM_1 },
  },

  // ── 1.5s: Rebuild creates plan ──
  {
    delay: 1500,
    step: {
      id: "s2", agent: "rebuild", kind: "tool_call",
      toolName: "create_plan", toolLabel: "制定计划",
      argSummary: "通知系统",
      message: "正在制定执行计划",
      timestamp: BASE + 1500,
    },
    mateStreaming: { rebuild: REBUILD_FINAL },
  },
  {
    delay: 2500,
    step: {
      id: "s3", agent: "rebuild", kind: "tool_result",
      toolName: "create_plan", toolLabel: "制定计划",
      success: true,
      resultPreview: "三阶段执行计划已创建",
      message: "计划已创建",
      timestamp: BASE + 2500,
    },
  },

  // ── 3s: Flush rebuild message + assign planner ──
  {
    delay: 3000,
    agents: [
      { name: "rebuild", status: "working", current_task: "分配任务给团队" },
      { name: "planner", status: "working", current_task: "设计通知系统数据模型" },
      { name: "developer", status: "idle" },
      { name: "deployer", status: "idle" },
    ],
    comm: {
      id: "c1", team_id: "demo-team", from_agent: "rebuild", to_agent: "planner",
      message_type: "task_assignment",
      payload: { message: "设计通知系统数据模型和 API Schema" },
      read: false, created_at: new Date(BASE + 3000).toISOString(),
    },
    step: {
      id: "s4", agent: "rebuild", kind: "text",
      message: "已将 Schema 设计任务分配给 Planner",
      timestamp: BASE + 3000,
    },
    mateMsgs: [{ agent: "rebuild", role: "assistant", content: REBUILD_FINAL }],
  },

  // ── 3.5s: Planner starts ──
  {
    delay: 3500,
    step: {
      id: "s5", agent: "planner", kind: "thinking",
      message: "分析通知系统 Schema 需求...",
      timestamp: BASE + 3500,
    },
  },

  // ── 4s: Planner streaming starts ──
  {
    delay: 4000,
    mateStreaming: { planner: PLANNER_STREAM_1 },
  },

  // ── 5s: Planner searches codebase ──
  {
    delay: 5000,
    step: {
      id: "s6", agent: "planner", kind: "tool_call",
      toolName: "search_codebase", toolLabel: "搜索代码库",
      argSummary: "现有通知模型",
      message: "正在搜索代码库",
      timestamp: BASE + 5000,
    },
    mateStreaming: { planner: PLANNER_STREAM_2 },
  },
  {
    delay: 6000,
    step: {
      id: "s7", agent: "planner", kind: "tool_result",
      toolName: "search_codebase", toolLabel: "搜索代码库",
      success: true,
      resultPreview: "在 /lib/models/ 中找到 3 个相关模型",
      message: "搜索完成",
      timestamp: BASE + 6000,
    },
  },

  // ── 6.5s: Assign developer ──
  {
    delay: 6500,
    agents: [
      { name: "rebuild", status: "working", current_task: "协调团队进度" },
      { name: "planner", status: "working", current_task: "设计通知系统数据模型" },
      { name: "developer", status: "working", current_task: "实现通知 API 端点" },
      { name: "deployer", status: "idle" },
    ],
    comm: {
      id: "c2", team_id: "demo-team", from_agent: "rebuild", to_agent: "developer",
      message_type: "task_assignment",
      payload: { message: "实现通知系统 REST API 端点" },
      read: false, created_at: new Date(BASE + 6500).toISOString(),
    },
    step: {
      id: "s8", agent: "rebuild", kind: "text",
      message: "已将 API 实现任务分配给 Developer",
      timestamp: BASE + 6500,
    },
  },

  // ── 7s: Developer starts + planner continues streaming ──
  {
    delay: 7000,
    step: {
      id: "s9", agent: "developer", kind: "thinking",
      message: "规划通知 API 结构...",
      timestamp: BASE + 7000,
    },
    mateStreaming: { planner: PLANNER_STREAM_3 },
  },

  // ── 7.5s: Developer streaming starts ──
  {
    delay: 7500,
    mateStreaming: { planner: PLANNER_STREAM_3, developer: DEV_STREAM_1 },
  },

  // ── 8s: Planner writes file ──
  {
    delay: 8000,
    step: {
      id: "s10", agent: "planner", kind: "tool_call",
      toolName: "write_file", toolLabel: "写入文件",
      argSummary: "lib/models/notification.ts",
      message: "正在写入 Schema 文件",
      timestamp: BASE + 8000,
    },
  },

  // ── 9s: Developer writes code + dev streaming grows ──
  {
    delay: 9000,
    step: {
      id: "s11", agent: "developer", kind: "tool_call",
      toolName: "write_file", toolLabel: "写入文件",
      argSummary: "app/api/notifications/route.ts",
      message: "正在写入 API 路由",
      timestamp: BASE + 9000,
    },
    mateStreaming: { planner: PLANNER_STREAM_3, developer: DEV_STREAM_2 },
  },

  // ── 10s: Planner completes file ──
  {
    delay: 10000,
    step: {
      id: "s12", agent: "planner", kind: "tool_result",
      toolName: "write_file", toolLabel: "写入文件",
      success: true,
      resultPreview: "notification.ts 已创建（42 行）",
      message: "Schema 文件已写入",
      timestamp: BASE + 10000,
    },
  },

  // ── 10.5s: Planner done — flush to message ──
  {
    delay: 10500,
    agents: [
      { name: "rebuild", status: "working", current_task: "协调团队进度" },
      { name: "planner", status: "completed", current_task: "Schema 设计完成" },
      { name: "developer", status: "working", current_task: "实现通知 API 端点" },
      { name: "deployer", status: "idle" },
    ],
    step: {
      id: "s13", agent: "planner", kind: "completion",
      message: "Schema 设计完成：Notification、Channel、Preference 模型",
      timestamp: BASE + 10500,
    },
    comm: {
      id: "c3", team_id: "demo-team", from_agent: "planner", to_agent: "rebuild",
      message_type: "message",
      payload: { message: "Schema 设计完成，已创建 3 个 TypeScript 模型定义。" },
      read: false, created_at: new Date(BASE + 10500).toISOString(),
    },
    mateMsgs: [{ agent: "planner", role: "assistant", content: PLANNER_FINAL }],
  },

  // ── 11s: Developer tool result + streaming grows ──
  {
    delay: 11000,
    step: {
      id: "s14", agent: "developer", kind: "tool_result",
      toolName: "write_file", toolLabel: "写入文件",
      success: true,
      resultPreview: "route.ts 已创建（85 行）",
      message: "API 路由已写入",
      timestamp: BASE + 11000,
    },
    mateStreaming: { developer: DEV_STREAM_3 },
  },
  {
    delay: 12000,
    step: {
      id: "s15", agent: "developer", kind: "tool_call",
      toolName: "run_tests", toolLabel: "运行测试",
      argSummary: "notifications.test.ts",
      message: "正在运行测试",
      timestamp: BASE + 12000,
    },
  },

  // ── 13s: Assign deployer ──
  {
    delay: 13000,
    agents: [
      { name: "rebuild", status: "working", current_task: "协调团队进度" },
      { name: "planner", status: "completed" },
      { name: "developer", status: "working", current_task: "运行测试" },
      { name: "deployer", status: "working", current_task: "准备部署配置" },
    ],
    comm: {
      id: "c4", team_id: "demo-team", from_agent: "rebuild", to_agent: "deployer",
      message_type: "task_assignment",
      payload: { message: "准备通知服务的部署配置" },
      read: false, created_at: new Date(BASE + 13000).toISOString(),
    },
    step: {
      id: "s16", agent: "deployer", kind: "thinking",
      message: "规划通知服务部署方案...",
      timestamp: BASE + 13000,
    },
  },

  // ── 13.5s: Deployer streaming starts ──
  {
    delay: 13500,
    mateStreaming: { developer: DEV_STREAM_3, deployer: DEPLOYER_STREAM_1 },
  },

  // ── 14s: Developer tests pass ──
  {
    delay: 14000,
    step: {
      id: "s17", agent: "developer", kind: "tool_result",
      toolName: "run_tests", toolLabel: "运行测试",
      success: true,
      resultPreview: "6 个测试通过，0 个失败",
      message: "测试通过",
      timestamp: BASE + 14000,
    },
  },

  // ── 14.5s: Developer done — flush to message ──
  {
    delay: 14500,
    agents: [
      { name: "rebuild", status: "working", current_task: "协调团队进度" },
      { name: "planner", status: "completed" },
      { name: "developer", status: "completed", current_task: "API 实现完成" },
      { name: "deployer", status: "working", current_task: "编写部署配置" },
    ],
    step: {
      id: "s18", agent: "developer", kind: "completion",
      message: "API 实现完成：4 个端点，6 个测试通过",
      timestamp: BASE + 14500,
    },
    comm: {
      id: "c5", team_id: "demo-team", from_agent: "developer", to_agent: "rebuild",
      message_type: "message",
      payload: { message: "API 实现完成，6 个测试全部通过。" },
      read: false, created_at: new Date(BASE + 14500).toISOString(),
    },
    mateMsgs: [{ agent: "developer", role: "assistant", content: DEV_FINAL }],
  },

  // ── 15s: Deployer writes config + streaming grows ──
  {
    delay: 15000,
    step: {
      id: "s19", agent: "deployer", kind: "tool_call",
      toolName: "write_file", toolLabel: "写入文件",
      argSummary: "deploy/notification-service.yaml",
      message: "正在写入部署配置",
      timestamp: BASE + 15000,
    },
    mateStreaming: { deployer: DEPLOYER_STREAM_2 },
  },

  // ── 16.5s: Deployer tool result ──
  {
    delay: 16500,
    step: {
      id: "s20", agent: "deployer", kind: "tool_result",
      toolName: "write_file", toolLabel: "写入文件",
      success: true,
      resultPreview: "部署配置已创建",
      message: "配置已写入",
      timestamp: BASE + 16500,
    },
  },

  // ── 17s: Deployer done — flush to message ──
  {
    delay: 17000,
    agents: [
      { name: "rebuild", status: "working", current_task: "撰写最终总结" },
      { name: "planner", status: "completed" },
      { name: "developer", status: "completed" },
      { name: "deployer", status: "completed", current_task: "部署配置就绪" },
    ],
    step: {
      id: "s21", agent: "deployer", kind: "completion",
      message: "部署配置就绪：Kubernetes Manifest + CI/CD Pipeline",
      timestamp: BASE + 17000,
    },
    comm: {
      id: "c6", team_id: "demo-team", from_agent: "deployer", to_agent: "rebuild",
      message_type: "message",
      payload: { message: "部署配置就绪，包含 K8s Manifest 和 CI/CD Pipeline。" },
      read: false, created_at: new Date(BASE + 17000).toISOString(),
    },
    mateMsgs: [{ agent: "deployer", role: "assistant", content: DEPLOYER_FINAL }],
  },

  // ── 18s: Team Lead wraps up ──
  {
    delay: 18000,
    step: {
      id: "s22", agent: "rebuild", kind: "completion",
      message: "所有任务完成，通知系统准备就绪。",
      timestamp: BASE + 18000,
    },
  },
  {
    delay: 18500,
    agents: [
      { name: "rebuild", status: "completed", current_task: "任务完成" },
      { name: "planner", status: "completed" },
      { name: "developer", status: "completed" },
      { name: "deployer", status: "completed" },
    ],
    message: {
      id: "final",
      conversation_id: "demo",
      role: "assistant",
      content:
        "通知系统已由团队协作完成：\n\n" +
        "- **Planner** 设计了数据模型（`Notification`、`Channel`、`Preference`）\n" +
        "- **Developer** 实现了 4 个 REST API 端点，6 个测试全部通过\n" +
        "- **Deployer** 准备了 Kubernetes 部署配置和 CI/CD Pipeline\n\n" +
        "所有任务已完成，可以进行代码审查。",
      metadata: null,
      created_at: new Date(BASE + 18500).toISOString(),
    },
  },
];

// ---------------------------------------------------------------------------
// Initial chat messages
// ---------------------------------------------------------------------------

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "u1",
    conversation_id: "demo",
    role: "user",
    content: "构建一个通知系统，支持邮件、推送和站内三种渠道。包含 API 端点和部署配置。",
    metadata: null,
    created_at: new Date(BASE - 5000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Helper: group steps by agent
// ---------------------------------------------------------------------------

function groupStepsByAgent(
  steps: StructuredAgentStep[],
  agents: AgentStatus[],
): Map<string, StructuredAgentStep[]> {
  const map = new Map<string, StructuredAgentStep[]>();
  for (const a of agents) map.set(a.name, []);
  for (const step of steps) {
    const arr = map.get(step.agent);
    if (arr) arr.push(step);
    else map.set(step.agent, [step]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Demo Page
// ---------------------------------------------------------------------------

export default function DemoPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [steps, setSteps] = useState<StructuredAgentStep[]>([]);
  const [comms, setComms] = useState<AgentMailMessage[]>([]);
  const [teamActive, setTeamActive] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [contextUsage, setContextUsage] = useState<{ estimated: number; max: number; ratio: number } | null>(null);

  // Mate chat state
  const [mateChatMessages, setMateChatMessages] = useState<Record<string, MateChatMessage[]>>({});
  const [mateStreamingTokens, setMateStreamingTokens] = useState<Record<string, string>>({});

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const startSimulation = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    setAgents([]);
    setSteps([]);
    setComms([]);
    setMateChatMessages({});
    setMateStreamingTokens({});
    setTeamActive(true);
    setCollapsed(false);
    setStreaming(true);
    setContextUsage({ estimated: 12000, max: 200000, ratio: 0.06 });

    for (const entry of TIMELINE) {
      const timer = setTimeout(() => {
        if (entry.agents) setAgents(entry.agents);
        if (entry.step) setSteps((prev) => [...prev, entry.step!]);
        if (entry.comm) setComms((prev) => [...prev, entry.comm!]);

        // Set streaming content
        if (entry.mateStreaming) {
          setMateStreamingTokens((prev) => ({ ...prev, ...entry.mateStreaming }));
        }

        // Flush completed messages + clear their streaming buffer
        if (entry.mateMsgs) {
          const msgs = entry.mateMsgs;
          setMateChatMessages((prev) => {
            const next = { ...prev };
            for (const m of msgs) {
              next[m.agent] = [
                ...(next[m.agent] || []),
                { role: m.role, content: m.content, timestamp: Date.now() },
              ];
            }
            return next;
          });
          const agentsToClear = msgs.map((m) => m.agent);
          setMateStreamingTokens((prev) => {
            const next = { ...prev };
            for (const a of agentsToClear) delete next[a];
            return next;
          });
        }

        if (entry.step) {
          setContextUsage((prev) => {
            if (!prev) return { estimated: 12000, max: 200000, ratio: 0.06 };
            const growth = 4000 + Math.random() * 8000;
            const newEstimated = Math.min(prev.estimated + growth, prev.max);
            return { estimated: newEstimated, max: prev.max, ratio: newEstimated / prev.max };
          });
        }

        if (entry.message) {
          setMessages((prev) => [...prev, entry.message!]);
          setTeamActive(false);
          setStreaming(false);
        }
      }, entry.delay);
      timersRef.current.push(timer);
    }
  }, []);

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startSimulation();
    return () => timersRef.current.forEach(clearTimeout);
  }, [startSimulation]);

  const handleReset = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setMessages(INITIAL_MESSAGES);
    setAgents([]);
    setSteps([]);
    setComms([]);
    setMateChatMessages({});
    setMateStreamingTokens({});
    setTeamActive(false);
    setCollapsed(false);
    setStreaming(false);
    setContextUsage(null);
    startedRef.current = false;
    setTimeout(() => {
      startedRef.current = true;
      startSimulation();
    }, 100);
  }, [startSimulation]);

  const handleStop = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const textSteps = steps.filter((s) => s.kind === "text" || s.kind === "completion");
    const partial = textSteps.map((s) => s.message).join("\n") || "团队执行已停止。";

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        conversation_id: "demo",
        role: "assistant",
        content: partial,
        metadata: { stopped: true },
        created_at: new Date().toISOString(),
      },
    ]);
    setTeamActive(false);
    setStreaming(false);
  }, [steps]);

  const handleSend = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        conversation_id: "demo",
        role: "user",
        content: text,
        metadata: null,
        created_at: new Date().toISOString(),
      },
    ]);
  }, []);

  const agentStepsMap = groupStepsByAgent(steps, agents);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800/50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-sm font-medium text-zinc-300">
              团队协作演示
            </h1>
            <p className="text-xs text-zinc-600 mt-0.5">
              Team Lead 分配任务，Mate Agent 并行执行 — 自动播放中
            </p>
          </div>
          <button
            onClick={handleReset}
            className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            重新播放
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className={`${teamActive && agents.length > 0 ? 'flex-shrink-0 max-h-[15vh]' : 'flex-1'} overflow-y-auto`}>
        <div className="max-w-3xl mx-auto px-4 pt-6 pb-4 space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
      </div>

      {/* Team collaboration view — fills remaining viewport */}
      {teamActive && agents.length > 0 && (
        <div className="flex-1 min-h-0 flex flex-col px-3 pb-2">
          <div className="flex flex-col flex-1 min-h-0 border border-zinc-800/50 rounded-2xl bg-zinc-900/40 overflow-hidden">
            <TeamStatusBar
              agents={agents}
              collapsed={collapsed}
              onToggle={() => setCollapsed(!collapsed)}
            />
            {!collapsed && (
              <AgentLaneGrid
                agents={agents}
                agentStepsMap={agentStepsMap}
                page={0}
                onPageChange={() => {}}
                teamId={null}
                mateChatMessages={mateChatMessages}
                mateStreamingTokens={mateStreamingTokens}
                communications={comms}
              />
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm">
        <ChatInput
          onSubmit={handleSend}
          onStop={handleStop}
          streaming={streaming}
        />
      </div>
    </div>
  );
}
