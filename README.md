# 🧠 dsh-model-memory

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![DSH Ecosystem](https://img.shields.io/badge/DSH-Plugin-blueviolet.svg)](https://github.com/deepseek-ai/deepseek-harness)

**dsh-model-memory** is a plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) that provides reasoning effort management and cross-session preference memory for custom API models.

---

## ✨ Features

1. **🧠 Model Reasoning Effort Configuration**:
   - Easily enable and configure reasoning effort (`supportsReasoningEffort: true`) for any custom API models directly inside DSH Settings -> Models.
   - Choose supported effort tiers (`low` / `medium` / `high` / `max`).
   - One-click save writes atomically to `~/.dsh/settings.yaml`.

2. **⚡ Cross-Session Preference Memory**:
   - Remembers the last selected model and reasoning effort per channel.
   - Automatically restores preferences when switching channels or starting new sessions.

3. **🛡️ Lightweight & Upgrade-Safe**:
   - Zero clutter on main interface, seamlessly integrated into settings.
   - Safe against DSH CLI upgrades through home-level patch layer.

---

## 🚀 Installation

```bash
# Add to DSH web profile
dsh plugin --profile web add dsh-model-memory

# Or develop locally with link
dsh plugin --profile web add link:/path/to/dsh-model-memory
```

---

## 🧪 Development

```bash
# Typecheck
pnpm run typecheck

# Run unit tests
pnpm run test

# Full verification and build
pnpm run verify
```

---

## 📄 License

Licensed under the [MIT License](./LICENSE).
