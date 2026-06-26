# AI 笔记助手 - 项目规范

## 项目概览

AI 笔记助手（AI Note Buddy）是一个面向大学生的期末复习 AI 助手。用户上传 PDF 课件或输入文本，AI 自动整理成结构清晰的学习笔记。

- **技术栈**: Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind CSS 4 + shadcn/ui
- **AI 能力**: 通过 `coze-coding-dev-sdk` 集成内置大模型，支持流式输出
- **PDF 解析**: 使用 `unpdf` 库在服务端提取 PDF 文本

## 目录结构

```
src/
├── app/
│   ├── layout.tsx              # 全局布局（字体、元数据）
│   ├── page.tsx                # 首页（上传 + 笔记展示）
│   ├── globals.css             # 全局样式（Tailwind + 自定义变量）
│   └── api/
│       ├── generate/route.ts   # 核心 API：PDF 解析 + LLM 笔记生成（SSE 流式）
│       └── health/route.ts     # 健康检查
├── components/ui/              # shadcn/ui 组件库
└── lib/utils.ts                # 工具函数
```

## 核心 API

### POST /api/generate

接收 PDF 文件或纯文本，调用 LLM 生成结构化学习笔记，通过 SSE 流式返回。

**请求**:
- `multipart/form-data`，字段 `file`（PDF 文件）或 `text`（纯文本）
- 可选 query 参数：`mode`（outline/summary/qA）

**响应**: SSE 流，事件类型包括 `info`、`progress`、`content`、`done`、`error`

## 开发命令

```bash
pnpm install          # 安装依赖
pnpm dev              # 开发模式
pnpm build            # 生产构建
pnpm start            # 生产启动
```

## 关键依赖

| 包名 | 用途 |
|------|------|
| `coze-coding-dev-sdk` | LLM 调用（流式/非流式） |
| `unpdf` | PDF 文本提取（服务端） |
| `react-markdown` | Markdown 渲染 |
| `remark-gfm` | GFM 支持（表格等） |
| `react-syntax-highlighter` | 代码高亮 |
