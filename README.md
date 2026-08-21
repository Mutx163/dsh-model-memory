# 🧠 dsh-model-memory

<p align="center">
  <a href="https://github.com/Mutx163/dsh-model-memory/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/DSH-Plugin-blueviolet.svg" alt="DSH Ecosystem"></a>
  <img src="https://img.shields.io/badge/TypeScript-Ready-3178c6.svg" alt="TypeScript">
</p>

<p align="center">
  <b>简体中文</b> | <a href="./README_EN.md">English</a>
</p>

---

**dsh-model-memory** 是专为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 打造的自定义 API 模型思考等级管理与偏好持久记忆插件。

---

## 🌟 核心功能

### 1. 🧠 自定义模型思考等级一键配置
* **直接嵌入官方设置**：在 DSH 官方「设置 -> 模型」中，展开自定义 API 模型时，自动挂载极简思考等级配置栏。
* **思考档位自由勾选**：支持为模型一键开启 `supportsReasoningEffort` 并勾选档位（`low` / `medium` / `high` / `max`）。
* **即时生效与持久化**：点击保存原子化写入 `~/.dsh/settings.yaml`，即时热重载。

### 2. ⚡ 跨会话模型与思考强度偏好记忆
* **分渠道精准记忆**：跨会话精准记录每个渠道最后选用的模型及其配置的思考强度（如 `max` 强度）。
* **新建会话自动回填**：切换渠道或新建会话时自动保持历史偏好，不再自动回退到默认基本强度。

### 3. 🛡️ 纯净轻量 & 升级防抹除
* **零界面冗余**：彻底移除多余按钮，主界面 100% 保持原生清爽。
* **升级免疫**：基于独立本地工程与 DSH Profile 软链接机制，升级 DSH 全局脚手架永不丢失插件与配置。

---

## 🚀 安装与挂载

### 方式一：从 NPM 安装（推荐）
```bash
dsh plugin --profile web add dsh-model-memory
```

### 方式二：本地软链接开发与挂载
```bash
# 1. 克隆仓库
git clone https://github.com/Mutx163/dsh-model-memory.git
cd dsh-model-memory

# 2. 安装依赖并编译验证
pnpm install
pnpm run verify

# 3. 软链接挂载至 DSH Web Profile
dsh plugin --profile web add link:/path/to/dsh-model-memory
```

---

## 📂 项目结构

```text
dsh-model-memory/
├── src/
│   ├── index.ts        # 插件生命周期挂载与 Agent 模型劫持
│   ├── memory.ts       # 渠道与思考强度记忆算法引擎
│   ├── rpc.ts          # /model-memory RPC 双向通信通道
│   ├── settings.ts     # settings.yaml 渠道配置原子管理器
│   ├── store.ts        # 磁盘持久化存储引擎 (~/.dsh/model-memory.json)
│   ├── types.ts        # TypeScript 类型定义
│   └── client/
│       └── index.ts    # Web UI 前端组件（模型设置条目内嵌与插件卡片）
├── test/               # Vitest 单元测试用例
│   ├── memory.test.ts
│   ├── settings.test.ts
│   └── store.test.ts
├── cordis.patch.yml    # Cordis 补丁层定义
├── LICENSE             # MIT 开源协议
├── README.md           # 中文说明文档
└── README_EN.md        # English Documentation
```

---

## 🧪 开发与测试

```bash
# 执行 TypeScript 类型检查
pnpm run typecheck

# 运行全套 Vitest 单元测试
pnpm run test

# 完整验证与打包构建（产物输出至 lib/）
pnpm run verify
```

---

## 📄 开源协议

本项目采用 [MIT License](./LICENSE) 开源协议。
