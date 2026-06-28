<div align="center">

# 🗺️ AI Travel Planner

### 智能旅行规划 Agent

**输入目的地和天数，AI 5 秒生成一份量身定制的旅行攻略**

[![Python](https://img.shields.io/badge/Python-3.12%2B-blue?logo=python&logoColor=white)](https://www.python.org/)
[![LangChain](https://img.shields.io/badge/LangChain-1.0-2D9CDB?logo=langchain)](https://python.langchain.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-1.0-8B5CF6)](https://langchain-ai.github.io/langgraph/)
[![License](https://img.shields.io/badge/License-CC%20BY--NC%204.0-orange)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com)

[English](#english) | [中文](#中文)

---

</div>

<a id="中文"></a>

## 📖 项目简介

**AI Travel Planner** 是一个基于大语言模型（LLM）的智能旅行规划 Agent，旨在解决旅行攻略制作繁琐、信息分散的痛点。

> 做攻略太累了：翻 10 篇小红书、查 5 个 App、最后拼出来的行程还可能路线绕、时间赶、不合口味。

用户只需输入 **目的地** 和 **天数**，Agent 即可自动联网检索目的地实时信息（景点、美食、交通、门票价格等），并生成一份结构清晰、路线合理的个性化旅行攻略。同时支持通过多轮对话随时调整优化行程。

> ⚠️ **本项目仅供学习交流使用，不得用于任何商业目的。**

---

## ✨ 功能特性

| 功能 | 说明 |
|:-----|:-----|
| 🗺️ **智能行程规划** | 根据目的地和天数，自动生成每日详细行程（景点、餐饮、交通、住宿） |
| 🔍 **实时信息检索** | 联网搜索目的地最新门票价格、开放时间、天气、交通等实时信息 |
| 💬 **对话式调整** | 支持多轮对话，随时替换景点、调整节奏、修改预算 |
| 🧠 **上下文记忆** | 保留最近 20 轮对话记忆，支持连续对话修改行程 |
| 💰 **预算估算** | 自动估算交通、住宿、餐饮、门票等各项花费 |
| 🛡️ **容错机制** | 工具调用失败时优雅降级，不中断对话体验 |
| 🎨 **清新 UI** | 蓝绿渐变背景 + 毛玻璃效果 + Markdown 渲染的聊天界面 |

---

## 🖥️ 界面预览

### 聊天主界面

<p align="center">
  <img src="https://coze-coding-project.tos.coze.site/coze_storage_7655699269563121716/ai-travel-planner-assets/screenshot-chat-main_23141a96.png?sign=1814163687-ed4531edc4-0-e24b165758a70ee63bdf0a5645e484489b7051969fec72960b8231d6e33c4476" alt="AI旅行规划师 - 聊天主界面" width="80%" />
</p>

> 清新旅行风设计：蓝绿渐变背景 + 毛玻璃卡片 + 热门目的地快捷标签

### 对话与攻略展示

<p align="center">
  <img src="https://coze-coding-project.tos.coze.site/coze_storage_7655699269563121716/ai-travel-planner-assets/screenshot-chat-response_0ff97430.png?sign=1814163687-a2b5556bd5-0-8cd3960fce6c7a36d5290c9fc6004a8442d4dfa83047b625f697675f7678ca7b" alt="AI旅行规划师 - 攻略生成效果" width="80%" />
</p>

> 流式输出结构化攻略，包含每日行程、美食推荐、交通指南、预算总览

---

## 🏗️ 架构设计

```
┌──────────────────────────────────────────────────────────────┐
│                       用户交互层                              │
│           Chat UI (HTML/CSS/JS) + FastAPI Endpoint           │
└──────────────────────────┬───────────────────────────────────┘
                           │  SSE Stream
┌──────────────────────────▼───────────────────────────────────┐
│                     Agent 核心层                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  LangGraph Agent (create_agent)                        │  │
│  │  ┌────────────────┐    ┌────────────────────────────┐  │  │
│  │  │  System Prompt  │    │  短期记忆 (MemorySaver)    │  │  │
│  │  │  (旅行规划师)    │    │  滑动窗口 20轮 / 40条消息  │  │  │
│  │  └────────────────┘    └────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                      工具层 (Tools)                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  🔍 search_travel_info                                 │  │
│  │  SearchClient → Web Search + AI Summary                │  │
│  │  实时获取景点 / 美食 / 交通 / 门票 / 天气信息           │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                      模型层 (LLM)                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  doubao-seed-2-0-pro  (Thinking Mode: Enabled)         │  │
│  │  旗舰级推理模型 · 复杂行程规划 · 多步决策               │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 📁 项目结构

```
.
├── config/                           # 配置目录
│   └── agent_llm_config.json         # LLM 模型配置 & System Prompt
├── src/
│   ├── agents/
│   │   └── agent.py                  # Agent 核心逻辑 (build_agent)
│   ├── tools/
│   │   └── web_search_tool.py        # 联网搜索工具
│   ├── static/
│   │   └── index.html                # 前端聊天界面
│   ├── storage/
│   │   ├── memory/                   # 短期记忆 (Checkpointer)
│   │   ├── database/                 # 数据库存储
│   │   └── s3/                       # 对象存储
│   ├── utils/                        # 工具函数
│   └── main.py                       # FastAPI 服务入口
├── scripts/                          # 脚手架脚本
│   ├── setup.sh                      # 环境初始化
│   ├── local_run.sh                  # 本地运行
│   └── http_run.sh                   # HTTP 服务启动
├── assets/                           # 资源文件
├── pyproject.toml                    # 项目依赖声明 (uv)
├── uv.lock                           # 依赖锁定文件
├── LICENSE                           # 许可证
└── README.md                         # 项目说明文档
```

---

## 🚀 快速开始

### 环境要求

| 依赖 | 版本要求 |
|:-----|:---------|
| Python | >= 3.12 |
| uv | 最新版 |

### 安装步骤

```bash
# 1. 克隆项目
git clone <repo-url>
cd <project-dir>

# 2. 安装依赖（使用 uv）
uv sync

# 3. 启动 HTTP 服务
bash scripts/http_run.sh -p 5000
```

### 运行方式

```bash
# 启动 HTTP 服务（含前端界面）
bash scripts/http_run.sh -m http -p 5000

# 本地命令行运行 Agent
bash scripts/local_run.sh -m flow
```

启动后访问 `http://localhost:5000` 即可使用前端聊天界面。

---

## ⚙️ 配置说明

所有模型配置集中在 `config/agent_llm_config.json`：

```json
{
    "config": {
        "model": "doubao-seed-2-0-pro-260215",
        "temperature": 0.7,
        "top_p": 0.9,
        "max_completion_tokens": 10000,
        "timeout": 600,
        "thinking": "enabled"
    },
    "sp": "<System Prompt>",
    "tools": ["search_travel_info"]
}
```

| 字段 | 类型 | 说明 |
|:-----|:-----|:-----|
| `model` | string | LLM 模型 ID |
| `temperature` | float | 生成随机性 (0~2)，值越高越有创意 |
| `top_p` | float | 核采样参数 (0~1) |
| `max_completion_tokens` | int | 最大输出 token 数 |
| `timeout` | int | 请求超时时间（秒） |
| `thinking` | string | 思考模式：`enabled` / `disabled` |
| `sp` | string | System Prompt，定义 Agent 角色与行为 |
| `tools` | array | Agent 可调用的工具列表 |

---

## 💬 使用示例

### 基础用法

```
用户: 我想去京都玩5天，预算舒适档
AI:   [自动搜索京都景点、美食、交通信息]
      [生成5天详细行程，含每日安排、餐厅推荐、预算估算]
```

### 对话式调整

```
用户: Day3 不想去奈良，换成大阪购物
AI:   [调整 Day3 行程为大阪购物路线，推荐心斋桥、难波等商圈]
```

### 个性化需求

```
用户: 我带老人出行，行程不要太赶
AI:   [自动调整节奏，减少步行量，增加休息时间，推荐无障碍景点]
```

---

## 🛠️ 技术栈

| 组件 | 技术 | 说明 |
|:-----|:-----|:-----|
| Agent 框架 | LangChain 1.0 + LangGraph 1.0 | Agent 构建与状态管理 |
| 大语言模型 | doubao-seed-2-0-pro | 旗舰级推理模型，支持深度思考 |
| 联网搜索 | coze-coding-dev-sdk (SearchClient) | 实时信息检索 + AI 摘要 |
| 短期记忆 | LangGraph Checkpointer | 滑动窗口记忆 (20轮/40条) |
| 后端框架 | FastAPI + Uvicorn | HTTP 服务 & SSE 流式响应 |
| 前端 | HTML + Tailwind CSS + Marked.js | 聊天界面 & Markdown 渲染 |
| 包管理 | uv | 快速可靠的 Python 包管理 |

---

## 🤝 贡献指南

本项目仅供学习交流，欢迎提交 Issue 和 PR！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 发起 Pull Request

---

## 📄 许可证

本项目采用 **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** 许可证。

<a rel="license" href="http://creativecommons.org/licenses/by-nc/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by-nc/4.0/88x31.png" /></a>

### 许可要点

- ✅ **可以** — 复制、分发、展览、表演本作品及其演绎版本
- ✅ **可以** — 对本作品进行改编、混编
- ❌ **禁止** — 将本作品用于 **任何商业目的**
- 📋 **要求** — 使用时必须注明原作者姓名及出处，并提供许可证链接

> **免责声明**：本项目仅供学习和研究使用。AI 生成的旅行攻略信息仅供参考，实际出行前请再次确认景点开放时间、门票价格、交通方式等关键信息。作者不对因使用本项目信息而产生的任何损失承担责任。

---

<a id="english"></a>

---

## 📖 About

**AI Travel Planner** is an intelligent travel planning Agent powered by Large Language Models (LLM). It automatically generates personalized travel itineraries by searching real-time destination information online.

### Features

- 🗺️ Smart itinerary planning with daily schedules
- 🔍 Real-time web search for attractions, food, transport & prices
- 💬 Conversational adjustments via multi-turn dialogue
- 🧠 20-turn conversation memory
- 💰 Budget estimation
- 🛡️ Graceful error handling

### Quick Start

```bash
uv sync
bash scripts/http_run.sh -p 5000
```

### License

This project is licensed under the **CC BY-NC 4.0** License - see the [LICENSE](LICENSE) file for details.

**Non-commercial use only.** This project is intended for learning and educational purposes.
