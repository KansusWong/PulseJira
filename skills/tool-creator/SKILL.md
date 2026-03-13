---
name: 工具创建
description: 创建和管理自定义工具——将外部 API 或自定义逻辑封装为 Agent 可调用的工具。当用户需要接入新的 API 服务、创建数据处理工具、修改现有工具、或组织工具包时使用此技能。
---

# 自定义工具

## 关于工具

工具是 Agent 与外部世界交互的接口。内置工具覆盖了文件、搜索、浏览器等通用能力，而自定义工具让用户（或你）将任何外部 API 或自定义逻辑封装为 Agent 可调用的能力。

自定义工具有两种模式：

- **API 工具**：仅 `tool.json`，声明 HTTP 请求配置，零代码。适合直接对接外部 API。
- **CoreX 工具**：`tool.json` + `main.py`，可编程。通过 ToolContext 访问平台能力（文件读写、密钥、LLM 调用、子 Agent、HTTP 客户端、工具互调、缓存）。适合需要数据加工逻辑的场景。

判断原则：如果工具只需发一个 HTTP 请求并返回结果，用 API 工具。如果需要对返回数据做处理（过滤、聚合、调LLM、保存文件、组合多个请求），用 CoreX。

## 工具结构

```
tools/
├── weather_query/
│   └── tool.json              # API 工具
├── enterprise_search/
│   ├── tool.json              # CoreX 工具元信息
│   └── main.py                # CoreX 工具逻辑
└── jiandaoyun/                # 工具包
    ├── pack.json
    ├── search_data/
    │   └── tool.json
    └── write_data/
        ├── tool.json
        └── main.py
```

**目录名 = tool.json 的 name 字段**，这是工具的唯一标识。写入路径中的 `{name}` 必须与 tool.json 中 `name` 一致。

### tool.json 核心字段

```json
{
  "name": "tool_name",
  "description": "English description for Agent — what it does, what it returns",
  "params": {
    "param_name": {
      "type": "string",
      "description": "Parameter description"
    }
  }
}
```

- `name` — 工具标识符，英文 snake_case
- `description` — 给 Agent 阅读的英文工具描述，应说明功能和返回内容
- `params` — 参数定义，每个参数含 `type`（string/integer/number/boolean/array/object）和 `description`；无 `default` 字段的参数自动设为必填
- `display_name` — 可选，给用户看的中文名
- `description_zh` — 可选，给用户看的中文简介
- `api` — API 工具的 HTTP 配置（仅 API 模式）
- `secrets` — 密钥声明数组（见"密钥"章节）

### tool.json 高级字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `timeout` | integer | 120（CoreX）/ 30（API） | 执行超时秒数，最大 600 |
| `retry` | integer | 0 | 失败自动重试次数 |
| `max_result_size` | integer | 25000 | 返回结果最大字符数，超出自动截断 |
| `dependencies` | string[] | [] | CoreX 工具依赖的 Python 包名，加载时预检 |

## API 工具

通过 `tool.json` 的 `api` 字段声明 HTTP 请求。

### api 字段说明

| 字段 | 说明 |
|------|------|
| `url` | 请求地址，支持 `{SECRET_KEY}` 模板变量 |
| `method` | HTTP 方法：GET / POST / PUT / PATCH / DELETE |
| `auth` | 认证配置（见下方） |
| `params_mapping` | Agent 参数名到 API 字段名的映射，支持点分路径（如 `"query": "filter.keyword"`） |
| `query_defaults` | 固定的默认查询参数，自动附加到每次请求 |
| `headers` | 额外请求头，值支持 `{SECRET_KEY}` 模板变量 |

### 认证方式

**Bearer Token**（最常见）：
```json
"auth": { "type": "bearer", "secret": "API_KEY" }
```
自动设置 `Authorization: Bearer <API_KEY的值>`。

**自定义 Header**：
```json
"auth": { "type": "header", "key": "X-Api-Key", "value_template": "{API_KEY}" }
```

**Query 参数**：
```json
"auth": { "type": "query", "key": "appid", "secret": "OPENWEATHER_KEY" }
```
将密钥作为 URL 查询参数附加。`secret` 指定使用哪个声明的密钥，默认使用 `key` 同名密钥。

### 完整示例

```json
{
  "name": "weather_query",
  "description": "Query current weather for a city via OpenWeather API. Returns JSON with temperature, humidity, wind speed, and weather description.",
  "display_name": "查天气",
  "description_zh": "查询城市实时天气",
  "params": {
    "city": {
      "type": "string",
      "description": "City name, e.g. Beijing, London, Tokyo"
    }
  },
  "api": {
    "url": "https://api.openweathermap.org/data/2.5/weather",
    "method": "GET",
    "params_mapping": { "city": "q" },
    "query_defaults": { "units": "metric", "lang": "zh_cn" },
    "auth": { "type": "query", "key": "appid", "secret": "OPENWEATHER_KEY" }
  },
  "secrets": [
    { "key": "OPENWEATHER_KEY", "scope": "team", "label": "OpenWeather API Key" }
  ]
}
```

## CoreX 工具

`tool.json` 定义元信息，`main.py` 实现逻辑。CoreX 引擎提供超时保护、异常隔离、失败重试和结果截断。

### main.py 入口

```python
async def execute(ctx, **params):
    # ctx: ToolContext — 平台能力入口
    # params: tool.json 中声明的参数
    # 返回: str 或 dict（多模态）
    return "result"
```

函数可以是 `async def` 或普通 `def`。同步函数会自动在线程池中执行，不阻塞平台。

### ToolContext 完整 API

**文件操作**

| 方法 | 说明 |
|------|------|
| `ctx.save_file(name, content)` → str | 保存到会话文件目录，返回 Agent 路径 |
| `ctx.save_shared_file(name, content)` → str | 保存到共享文件目录 |
| `ctx.read_file(path)` → str | 读取工作空间内文件 |

**密钥**

| 方法 | 说明 |
|------|------|
| `ctx.secrets` | 自动合并的密钥字典（团队+用户级，按声明的 scope 选取） |

**HTTP 客户端**

| 方法 | 说明 |
|------|------|
| `ctx.http` | 复用连接池的 httpx.AsyncClient，工具生命周期内共享 |

用 `ctx.http` 替代每次创建 `httpx.AsyncClient()`，自动管理连接池生命周期：

```python
resp = await ctx.http.get("https://api.example.com/data", headers={"Authorization": f"Bearer {api_key}"})
data = resp.json()
```

**LLM 调用**

| 方法 | 说明 |
|------|------|
| `await ctx.call_llm(prompt, model=None, images=None, json_mode=False)` → str | LLM 调用 |

支持多模态输入和 JSON 模式：

```python
summary = await ctx.call_llm("总结这段数据", json_mode=True)
description = await ctx.call_llm("描述这张图片", images=["screenshot.png"])
```

**子 Agent**

| 方法 | 说明 |
|------|------|
| `await ctx.call_agent(task, tools=None)` → str | 派生子 Agent 处理复杂任务 |

**工具互调**

| 方法 | 说明 |
|------|------|
| `await ctx.call_tool(tool_name, **kwargs)` → str | 调用其他已注册工具 |

可调用内置工具或其他自定义工具：

```python
files = await ctx.call_tool("grep", pattern="error", path="logs/")
content = await ctx.call_tool("read", path="config.yaml")
```

**缓存**

| 方法 | 说明 |
|------|------|
| `ctx.cache` | 会话级 dict 缓存，同一会话内多次工具调用共享 |

适合缓存 token、连接信息等跨调用复用的数据：

```python
if "auth_token" not in ctx.cache:
    ctx.cache["auth_token"] = await fetch_token(ctx.secrets["API_KEY"])
token = ctx.cache["auth_token"]
```

**进度报告**

| 方法 | 说明 |
|------|------|
| `await ctx.report_progress(message, percentage=None)` | 向前端报告进度 |

```python
await ctx.report_progress("正在获取第 1 页数据...", 10)
await ctx.report_progress("数据处理完成", 100)
```

**日志**

| 方法 | 说明 |
|------|------|
| `ctx.log` | 工具专用 logger，自动关联工具名 |

```python
ctx.log.info(f"获取到 {len(results)} 条记录")
ctx.log.warning("API 返回了空结果")
```

**依赖校验**

| 方法 | 说明 |
|------|------|
| `ctx.require(*packages)` → list[str] | 检查包是否安装，返回缺失包名 |

```python
missing = ctx.require("pandas", "lxml")
if missing:
    return f"缺少依赖: {', '.join(missing)}"
```

**多模态返回**

| 方法 | 说明 |
|------|------|
| `ctx.return_with_images(text, image_paths)` → dict | 构建含图片的返回 |

**上下文信息**

| 属性 | 说明 |
|------|------|
| `ctx.session_id` | 当前会话 ID |
| `ctx.user_id` | 当前用户 ID |
| `ctx.agent_id` | 当前 Agent ID |

### 完整示例：企业数据搜索

tool.json:
```json
{
  "name": "enterprise_search",
  "description": "Search enterprise data, clean results, and generate summary. Returns summary text and saves clean data file for further use.",
  "display_name": "企业数据搜索",
  "description_zh": "搜索企业数据并生成摘要",
  "timeout": 180,
  "retry": 1,
  "dependencies": ["httpx"],
  "params": {
    "query": { "type": "string", "description": "Search keywords" },
    "save_raw": { "type": "boolean", "description": "Whether to also save raw data", "default": false }
  },
  "secrets": [
    { "key": "VENDOR_API_KEY", "scope": "team", "label": "数据供应商 API Key" }
  ]
}
```

main.py:
```python
import json

async def execute(ctx, query="", save_raw=False, **_kw):
    api_key = ctx.secrets["VENDOR_API_KEY"]

    await ctx.report_progress("正在查询数据...", 10)

    resp = await ctx.http.get(
        "https://data-vendor.com/api/search",
        params={"q": query, "limit": 100},
        headers={"Authorization": f"Bearer {api_key}"},
    )
    resp.raise_for_status()
    raw = resp.json()

    await ctx.report_progress("正在处理数据...", 50)

    if save_raw:
        ctx.save_file(f"raw_{query}.json", json.dumps(raw, ensure_ascii=False, indent=2))

    clean = [{"name": r["name"], "value": r["metric"]} for r in raw.get("results", [])]
    path = ctx.save_file(f"clean_{query}.json", json.dumps(clean, ensure_ascii=False, indent=2))

    await ctx.report_progress("正在生成摘要...", 80)

    summary = await ctx.call_llm(
        f"用中文概括以下查询结果的核心发现，不超过 300 字:\n{json.dumps(clean[:20], ensure_ascii=False)}"
    )

    return f"{summary}\n\n共 {len(clean)} 条结果，精简数据已保存: {path}"
```

### 复杂工具编排示例

CoreX 工具可以通过 `ctx.call_tool` 组合多个工具构建复杂工作流：

```python
import json

async def execute(ctx, topic="", **_kw):
    await ctx.report_progress("搜索相关文件...")
    
    search_result = await ctx.call_tool("grep", pattern=topic, path="files/")
    
    if "No matches" in search_result:
        web_data = await ctx.http.get(f"https://api.example.com/search?q={topic}")
        raw = web_data.json()
        ctx.save_file(f"{topic}_research.json", json.dumps(raw, ensure_ascii=False))
    
    await ctx.report_progress("生成分析报告...", 60)
    
    report = await ctx.call_llm(
        f"基于以下数据生成分析报告:\n{search_result[:3000]}",
        json_mode=True
    )
    
    path = ctx.save_file(f"{topic}_report.md", report)
    return f"报告已生成: {path}"
```

## 工具包

当多个工具属于同一服务时（如简道云的搜索、写入、创建表单），用工具包组织。

### pack.json

```json
{
  "name": "jiandaoyun",
  "display_name": "简道云",
  "description": "简道云数据操作工具集",
  "secrets": [
    { "key": "JDY_API_KEY", "scope": "team", "label": "简道云 API Key" }
  ]
}
```

包级 `secrets` 由包内所有工具共享，无需在每个 tool.json 中重复声明。工具级声明的同名密钥会覆盖包级声明。

## 密钥

### 声明格式

```json
"secrets": [
  { "key": "API_KEY", "scope": "team", "label": "API 密钥" }
]
```

- `key` — 代码中引用的标识符
- `scope` — `"team"`（空间管理员配置，全员共享）或 `"user"`（每个成员各自配置）
- `label` — 在设置界面展示的中文名称

### scope 判断

根据密钥的性质选择 scope：

**team**（服务级，全空间共享）：
- 公共 API 的共享密钥（天气、地图、翻译、搜索引擎等）
- 团队统一的 SaaS 账号（企业数据服务、监控平台等）

**user**（个人级，每人不同）：
- 个人账号的 Access Token（飞书、GitHub、Figma、Notion 等）
- 涉及个人权限或身份的凭据

不确定时，向用户确认。例如：
> 这个 API Key 是团队共享的（所有成员用同一个），还是每个人都有自己的？

### 用户提供密钥时

当用户在对话中给出了 API Key 或 Token：

1. 在 tool.json 的 `secrets` 中声明密钥（按上述原则判断 scope）
2. 通过 write 工具直接配置密钥值：
   - 团队密钥：`write(path="secrets/team/{KEY}", content="密钥值")`
   - 个人密钥：`write(path="secrets/user/{KEY}", content="密钥值")`
3. 不要将密钥值硬编码到 tool.json 或 main.py 中

密钥经 Fernet 加密安全存储，运行时自动解密注入到 `ctx.secrets` 或 API 工具的认证配置中。

### 用户未提供密钥时

在 tool.json 中声明 secrets，创建工具后提醒用户到 **设置 → 当前空间 → 资产 → 对应工具** 中配置密钥。

## 写入路径

通过 write_file 工具写入，路径以 `tools/` 开头（自动路由到团队工具资产目录）：

- 独立工具：`tools/{name}/tool.json`（+ `tools/{name}/main.py`）
- 工具包元信息：`tools/{pack_name}/pack.json`
- 包内工具：`tools/{pack_name}/{tool_name}/tool.json`（+ `main.py`）

## 创建流程

1. 理解用户需求，确定要接入的 API 或要实现的逻辑
2. 判断模式：纯 HTTP 转发 → API 工具；需要数据处理 → CoreX
3. 编写 tool.json（name、description、params，API 模式加 api 字段，按需加 timeout/retry/dependencies）
4. CoreX 模式下编写 main.py（优先使用 `ctx.http` 而非自建 httpx.AsyncClient）
5. 如需密钥，判断 scope 并在 secrets 中声明，提醒用户配置
6. 如果多个工具属于同一服务，用工具包组织

## 常见错误与排查

| 错误信息 | 原因 | 解决方式 |
|---------|------|---------|
| CoreX 工具执行超时 | 脚本执行时间超过 timeout 配置 | 增大 tool.json 的 `timeout`，或优化脚本逻辑 |
| CoreX 工具内存溢出 | 脚本分配了过多内存 | 减少一次性加载的数据量，分批处理 |
| CoreX 工具缺少 Python 依赖 | dependencies 中声明的包未安装 | 联系管理员在服务端安装 |
| 该工具尚未完成密钥配置 | secrets 声明的密钥未在设置中配置 | 到设置面板配置密钥，或通过 write 写入 secrets/ |
| Error: tool 'xxx' not found | call_tool 调用了不存在的工具 | 检查工具名拼写，确认工具已注册 |
| sys.exit() 不允许 | main.py 中调用了 sys.exit() | 改为 return 返回结果 |
