# 🧠 dsh-model-memory

<p align="center">
  <a href="https://github.com/Mutx163/dsh-model-memory/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/DSH-Plugin-blueviolet.svg" alt="DSH Ecosystem"></a>
  <img src="https://img.shields.io/badge/TypeScript-Ready-3178c6.svg" alt="TypeScript">
</p>

<p align="center">
  <a href="./README.md">简体中文</a> | <b>English</b>
</p>

---

**dsh-model-memory** is a plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) that provides reasoning effort management and cross-session preference memory for custom API models.

---

## 🌟 Key Features

### 1. 🧠 Custom Model Reasoning Effort Configuration
* **Seamless UI Integration**: Automatically mounts inline reasoning effort controls directly under custom model items inside DSH Settings -> Models.
* **Effort Tiers Selection**: Enables `supportsReasoningEffort` and allows selecting supported tiers (`low` / `medium` / `high` / `max`).
* **Instant Persistence**: Saves atomically into `~/.dsh/settings.yaml` with immediate effect.

### 2. ⚡ Cross-Session Preference Memory
* **Per-Channel Memory**: Accurately remembers the last chosen model and reasoning effort (e.g. `max`) per custom provider channel.
* **Auto-Fill on Session Start**: Automatically restores your preferred model and thinking tier when creating new sessions or switching channels.

### 3. 🛡️ Lightweight & Upgrade-Immune
* **Zero UI Clutter**: Clean integration within settings pages without adding stray buttons to the main view.
* **Upgrade-Safe**: Retains your configuration and local plugin across global DSH CLI upgrades.

---

## 🚀 Installation

### Option 1: Install from NPM (Recommended)
```bash
dsh plugin --profile web add dsh-model-memory
```

### Option 2: Local Development with Link
```bash
# 1. Clone repository
git clone https://github.com/Mutx163/dsh-model-memory.git
cd dsh-model-memory

# 2. Install dependencies & verify
pnpm install
pnpm run verify

# 3. Mount to DSH Web Profile
dsh plugin --profile web add link:/path/to/dsh-model-memory
```

---

## 📂 Project Structure

```text
dsh-model-memory/
├── src/
│   ├── index.ts        # Plugin lifecycle and Agent default model wrapper
│   ├── memory.ts       # Model & reasoning effort memory algorithm engine
│   ├── rpc.ts          # /model-memory bidirectional RPC channel
│   ├── settings.ts     # settings.yaml atomic configuration manager
│   ├── store.ts        # Disk persistence engine (~/.dsh/model-memory.json)
│   ├── types.ts        # TypeScript definitions
│   └── client/
│       └── index.ts    # Web UI client components
├── test/               # Vitest unit test suites
├── cordis.patch.yml    # Cordis patch layer
├── LICENSE             # MIT License
├── README.md           # Chinese Documentation (Default)
└── README_EN.md        # English Documentation
```

---

## 🧪 Development & Testing

```bash
# TypeScript typecheck
pnpm run typecheck

# Run unit tests
pnpm run test

# Full verification & build
pnpm run verify
```

---

## 📄 License

Licensed under the [MIT License](./LICENSE).
