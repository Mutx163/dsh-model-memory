# 🧠 dsh-model-memory

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![DSH Ecosystem](https://img.shields.io/badge/DSH-Plugin-blueviolet.svg)](https://github.com/deepseek-ai/deepseek-harness)

**dsh-model-memory** 是专为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 打造的自定义模型思考等级管理与偏好持久记忆插件。

---

## ✨ 核心特性

1. **🧠 自定义模型思考等级即时配置**：
   - 在 DSH 官方「设置 -> 模型」中直接为自定义 API 渠道的模型开启思考能力（`supportsReasoningEffort: true`）。
   - 自由勾选开启的思考档位（`low` / `medium` / `high` / `max`）。
   - 一键保存直接原子写入 `~/.dsh/settings.yaml`，即时生效。

2. **⚡ 跨会话偏好持久记忆**：
   - 记住每个渠道最后选用的模型与思考强度（如 `max` 档位）。
   - 新建会话或切换渠道时自动恢复历史偏好，告别自动回退基本强度。

3. **🛡️ 纯净轻量 & 升级防抹除**：
   - 仅嵌入设置面板，主界面零杂乱入口。
   - 通过 Home 级 Patch 与 Profile Bundle 挂载，DSH 全局版本升级永不丢失配置。

---

## 🚀 安装与挂载

### 方式一：从 NPM 安装到 DSH Web Profile
```bash
dsh plugin --profile web add dsh-model-memory
```

### 方式二：本地软链接开发
```bash
git clone https://github.com/Mutx163/dsh-model-memory.git
cd dsh-model-memory
pnpm install
pnpm run verify

# 挂载到 DSH
dsh plugin --profile web add link:/path/to/dsh-model-memory
```

---

## 🛠️ 项目结构

```text
dsh-model-memory/
├── src/
│   ├── index.ts        # 插件入口与生命周期绑定
│   ├── memory.ts       # 偏好记忆引擎
│   ├── rpc.ts          # /model-memory RPC 双向通讯
│   ├── settings.ts     # settings.yaml 渠道配置原子管理器
│   ├── store.ts        # 磁盘持久化存储引擎
│   └── client/
│       └── index.ts    # Web UI 前端组件（设置页嵌入与卡片）
├── test/               # Vitest 单元测试用例
└── cordis.patch.yml    # Cordis 补丁层定义
```

---

## 🧪 测试与构建

```bash
# 类型检查
pnpm run typecheck

# 单元测试
pnpm run test

# 完整验证与打包
pnpm run verify
```

---

## 📄 开源许可

本项目基于 [MIT License](./LICENSE) 开源。
