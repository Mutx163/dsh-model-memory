/**
 * dsh-model-memory — Web 客户端插件
 *
 * 遵循 DSH 原生设计语言与 CSS 变量规范，无表情符号，克制精炼。
 *
 * @module dsh-model-memory/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';

export const name = 'dsh-model-memory-client';
export const inject = ['connection'] as const;

const SETTINGS_CARD_SELECTOR = '[data-dsh-model-memory-card]';
const INLINE_INJECT_ATTR = 'data-dsh-mm-injected';

const ALL_STANDARD_TIERS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

interface CustomModelReasoningConfig {
  id: string;
  name?: string;
  contextWindow?: number;
  supportsReasoningEffort: boolean;
  thinkingFormat: string;
  reasoningEfforts: Record<string, string>;
  supportedEffortList: string[];
}

interface CustomProviderInfo {
  id: string;
  displayName: string;
  baseURL?: string;
  api?: string;
  models: CustomModelReasoningConfig[];
}

const cssText = `
/* 插件设置卡片样式：完全与 DSH 官方设计规范对齐 */
li[data-dsh-model-memory-card] {
  list-style: none;
  background: var(--dsw-alias-bg-layer-3);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 8px;
  transition: border-color 0.16s, background 0.16s;
  font-family: inherit;
  color: var(--dsw-alias-label-primary);
}
li[data-dsh-model-memory-card]:hover {
  border-color: var(--dsw-alias-label-dimmed);
}
li[data-dsh-model-memory-card].open {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-label-dimmed);
}
li[data-dsh-model-memory-card] .dsh-mm-header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  background: none;
  border: 0;
  cursor: pointer;
  text-align: left;
  color: inherit;
}
li[data-dsh-model-memory-card] .dsh-mm-head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
li[data-dsh-model-memory-card] .dsh-mm-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  line-height: 20px;
}
li[data-dsh-model-memory-card] .dsh-mm-desc {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  line-height: 18px;
}
li[data-dsh-model-memory-card] .dsh-mm-chevron {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  transition: transform 0.16s ease;
  flex: none;
}
li[data-dsh-model-memory-card].open .dsh-mm-chevron {
  transform: rotate(180deg);
}
li[data-dsh-model-memory-card] .dsh-mm-body {
  border-top: 1px solid var(--dsw-alias-border-l2);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
li[data-dsh-model-memory-card] .dsh-mm-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
li[data-dsh-model-memory-card] .dsh-mm-switch-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
li[data-dsh-model-memory-card] .dsh-mm-switch-hint {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
li[data-dsh-model-memory-card] .dsh-mm-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
}
li[data-dsh-model-memory-card] .dsh-mm-tab {
  padding: 3px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: 0 0;
  cursor: pointer;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}
li[data-dsh-model-memory-card] .dsh-mm-tab:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
li[data-dsh-model-memory-card] .dsh-mm-tab.active {
  background: var(--dsw-alias-interactive-bg-hover-solid, var(--dsw-alias-bg-module-platform));
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-dimmed);
}
li[data-dsh-model-memory-card] .dsh-mm-model-row {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--dsw-alias-bg-layer-1);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
li[data-dsh-model-memory-card] .dsh-mm-model-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
li[data-dsh-model-memory-card] .dsh-mm-model-id {
  font-family: var(--ds-font-family-code, monospace);
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
li[data-dsh-model-memory-card] .dsh-mm-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  line-height: 16px;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l3);
}
li[data-dsh-model-memory-card] .dsh-mm-badge.active {
  color: var(--dsw-alias-state-success-primary);
  border-color: var(--dsw-alias-state-success-primary);
}
li[data-dsh-model-memory-card] .dsh-mm-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.dsh-mm-chk {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
  user-select: none;
}
.dsh-mm-btn {
  box-sizing: border-box;
  height: 26px;
  font: inherit;
  cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  padding: 0 10px;
  font-size: 12px;
  line-height: 24px;
  color: var(--dsw-alias-label-primary);
  background: 0 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dsh-mm-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-mm-btn:disabled {
  opacity: .4;
  cursor: default;
}
.dsh-mm-btn-primary {
  background: var(--dsw-alias-button-primary-fill, #2d6cdf);
  color: var(--dsw-alias-label-primary-foreground, #fff);
  border-color: transparent;
}
.dsh-mm-btn-primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, #2558b8);
}
.dsh-mm-input {
  box-sizing: border-box;
  height: 26px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  padding: 0 8px;
  font-size: 12px;
  width: 80px;
}
.dsh-mm-input:focus {
  border-color: var(--dsw-alias-brand-primary);
  outline: none;
}
.dsh-mm-status-text {
  font-size: 12px;
  color: var(--dsw-alias-state-success-primary);
}

/* 官方模型设置条目直接嵌入样式 */
.dsh-mm-inline-box {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsh-mm-inline-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.dsh-mm-inline-list {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
`;

function escapeHtml(value: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (char) => map[char] ?? char);
}

export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as unknown as ConnectionHandle | undefined;

  const style = document.createElement('style');
  style.textContent = cssText;
  document.head.append(style);

  let activeProviderIndex = 0;
  let cachedProviders: CustomProviderInfo[] = [];
  let isCardOpen = false;
  let memoryEnabled = true;

  const callRpc = async (endpoint: string, payload: unknown = {}): Promise<any> => {
    if (!connection?.rpc) {
      throw new Error('RPC not ready');
    }
    const res = (await connection.rpc.call('/model-memory', endpoint, payload)) as any;
    if (res && res.ok) {
      return res.value;
    }
    throw new Error(res?.error?.message || 'RPC error');
  };

  const syncConfig = async (): Promise<CustomProviderInfo[]> => {
    try {
      const [providers, status] = await Promise.all([
        callRpc('list-providers'),
        callRpc('status').catch(() => ({ enabled: true })),
      ]);
      cachedProviders = providers || [];
      memoryEnabled = status?.enabled ?? true;
      return cachedProviders;
    } catch {
      return cachedProviders;
    }
  };

  const buildTiersMarkup = (supportedList: string[], modelId: string, prefix = '') => {
    const allTiers = Array.from(new Set([...ALL_STANDARD_TIERS, ...supportedList]));
    const chks = allTiers
      .map((tier) => {
        const checked = supportedList.includes(tier) ? 'checked' : '';
        return `
        <label class="dsh-mm-chk">
          <input type="checkbox" data-${prefix}tier="${escapeHtml(tier)}" data-model="${escapeHtml(modelId)}" ${checked} />
          <span>${escapeHtml(tier)}</span>
        </label>
      `;
      })
      .join('');

    return `
      ${chks}
      <div style="display:inline-flex;align-items:center;gap:4px;">
        <input type="text" class="dsh-mm-input" placeholder="+ 自定义" data-${prefix}custom-input="${escapeHtml(modelId)}" />
        <button class="dsh-mm-btn" type="button" data-${prefix}custom-add="${escapeHtml(modelId)}">添加</button>
      </div>
    `;
  };

  // 1. 插件设置页内的可折叠卡片
  const renderCardContent = async (container: HTMLElement) => {
    const bodyEl = container.querySelector('.dsh-mm-body') as HTMLElement | null;
    if (!bodyEl) return;

    if (!isCardOpen) {
      bodyEl.style.display = 'none';
      container.classList.remove('open');
      return;
    }

    bodyEl.style.display = 'flex';
    container.classList.add('open');
    bodyEl.innerHTML = '<div style="color:var(--dsw-alias-label-tertiary);font-size:12px;">加载中...</div>';

    await syncConfig();

    const switchMarkup = `
      <div class="dsh-mm-switch-row">
        <div>
          <div class="dsh-mm-switch-label">偏好记忆</div>
          <div class="dsh-mm-switch-hint">${memoryEnabled ? '已开启跨会话模型与思考档位记忆' : '已暂停记忆'}</div>
        </div>
        <label class="dsh-mm-chk">
          <input type="checkbox" data-memory-switch ${memoryEnabled ? 'checked' : ''} />
          <span>${memoryEnabled ? '启用' : '关闭'}</span>
        </label>
      </div>
    `;

    if (cachedProviders.length === 0) {
      bodyEl.innerHTML = `
        ${switchMarkup}
        <div style="color:var(--dsw-alias-label-tertiary);font-size:12px;padding:4px 0;">
          暂无自定义 API 渠道。请在模型设置中添加渠道与模型。
        </div>
      `;
      bindSwitch(bodyEl, container);
      return;
    }

    if (activeProviderIndex >= cachedProviders.length) {
      activeProviderIndex = 0;
    }

    const currentProvider = cachedProviders[activeProviderIndex];
    if (!currentProvider) return;

    const tabsMarkup = cachedProviders
      .map(
        (p, idx) =>
          `<button class="dsh-mm-tab ${idx === activeProviderIndex ? 'active' : ''}" type="button" data-tab-idx="${idx}">${escapeHtml(p.displayName || p.id)}</button>`,
      )
      .join('');

    const modelsMarkup =
      currentProvider.models.length === 0
        ? '<div style="color:var(--dsw-alias-label-tertiary);font-size:12px;">该渠道暂无模型。</div>'
        : currentProvider.models
            .map((m) => {
              return `
          <div class="dsh-mm-model-row" data-model-id="${escapeHtml(m.id)}">
            <div class="dsh-mm-model-head">
              <span class="dsh-mm-model-id">${escapeHtml(m.id)}</span>
              <span class="dsh-mm-badge ${m.supportsReasoningEffort ? 'active' : ''}">
                ${m.supportsReasoningEffort ? '思考已启用' : '未启用'}
              </span>
            </div>
            <div class="dsh-mm-controls">
              <label class="dsh-mm-chk" style="font-weight:500;">
                <input type="checkbox" data-enable-reasoning data-model="${escapeHtml(m.id)}" ${m.supportsReasoningEffort ? 'checked' : ''} />
                <span>启用思考能力</span>
              </label>
            </div>
            <div class="dsh-mm-controls" data-tiers-container="${escapeHtml(m.id)}">
              ${buildTiersMarkup(m.supportedEffortList, m.id, '')}
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:2px;">
              <button class="dsh-mm-btn dsh-mm-btn-primary" type="button" data-save-btn data-model="${escapeHtml(m.id)}">保存</button>
              <span class="dsh-mm-status-text" data-msg="${escapeHtml(m.id)}" style="display:none;"></span>
            </div>
          </div>
        `;
            })
            .join('');

    bodyEl.innerHTML = `
      ${switchMarkup}
      <div class="dsh-mm-tabs">${tabsMarkup}</div>
      <div style="display:flex;flex-direction:column;gap:8px;">${modelsMarkup}</div>
    `;

    bindSwitch(bodyEl, container);

    bodyEl.querySelectorAll('[data-tab-idx]').forEach((el) => {
      el.addEventListener('click', (e) => {
        activeProviderIndex = Number((e.currentTarget as HTMLElement).dataset.tabIdx || 0);
        void renderCardContent(container);
      });
    });

    bodyEl.querySelectorAll('[data-custom-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const modelId = (btn as HTMLElement).dataset.customAdd || '';
        const input = bodyEl.querySelector(`input[data-custom-input="${CSS.escape(modelId)}"]`) as HTMLInputElement | null;
        const tierName = input?.value.trim();
        if (!tierName) return;

        const tiersContainer = bodyEl.querySelector(`[data-tiers-container="${CSS.escape(modelId)}"]`);
        if (!tiersContainer) return;

        if (tiersContainer.querySelector(`input[data-tier="${CSS.escape(tierName)}"]`)) {
          input!.value = '';
          return;
        }

        const newLabel = document.createElement('label');
        newLabel.className = 'dsh-mm-chk';
        newLabel.innerHTML = `<input type="checkbox" data-tier="${escapeHtml(tierName)}" data-model="${escapeHtml(modelId)}" checked /><span>${escapeHtml(tierName)}</span>`;
        tiersContainer.insertBefore(newLabel, btn.parentElement);
        input!.value = '';
      });
    });

    bodyEl.querySelectorAll('[data-save-btn]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const modelId = (e.currentTarget as HTMLElement).dataset.model || '';
        const row = bodyEl.querySelector(`.dsh-mm-model-row[data-model-id="${CSS.escape(modelId)}"]`);
        if (!row) return;

        const enableChk = row.querySelector('[data-enable-reasoning]') as HTMLInputElement | null;
        const tierInputs = row.querySelectorAll('input[data-tier]:checked');
        const msgEl = row.querySelector(`[data-msg="${CSS.escape(modelId)}"]`) as HTMLElement | null;

        const supportsReasoningEffort = Boolean(enableChk?.checked);
        const selectedTiers: string[] = [];
        tierInputs.forEach((input) => {
          const t = (input as HTMLInputElement).dataset.tier;
          if (t) selectedTiers.push(t);
        });

        if (supportsReasoningEffort && selectedTiers.length === 0) {
          selectedTiers.push('high', 'max');
        }

        const providerId = currentProvider?.id;
        if (!providerId) return;

        try {
          if (btn instanceof HTMLButtonElement) btn.disabled = true;
          await callRpc('update-model-reasoning', {
            providerId,
            modelId,
            supportsReasoningEffort,
            thinkingFormat: 'openai',
            reasoningEfforts: selectedTiers,
          });

          if (msgEl) {
            msgEl.textContent = '已保存';
            msgEl.style.display = 'inline';
            setTimeout(() => {
              if (msgEl) msgEl.style.display = 'none';
            }, 2000);
          }
          await renderCardContent(container);
        } catch (err: any) {
          if (msgEl) {
            msgEl.textContent = '保存失败: ' + err.message;
            msgEl.style.display = 'inline';
          }
        } finally {
          if (btn instanceof HTMLButtonElement) btn.disabled = false;
        }
      });
    });
  };

  const bindSwitch = (bodyEl: HTMLElement, container: HTMLElement) => {
    const memorySwitch = bodyEl.querySelector('[data-memory-switch]') as HTMLInputElement | null;
    memorySwitch?.addEventListener('change', async () => {
      const nextVal = Boolean(memorySwitch.checked);
      try {
        await callRpc('toggle-memory', { enabled: nextVal });
        memoryEnabled = nextVal;
        void renderCardContent(container);
      } catch {}
    });
  };

  const mountSettingsPluginCard = () => {
    const pluginList =
      document.querySelector('ul[class*="cards"], [class*="PluginsSettingsSection"], [class*="PluginSettings"]') ||
      document.querySelector('[data-pane="settings"] ul, [class*="settingsSection"] ul');

    if (!pluginList) return;
    if (pluginList.querySelector(SETTINGS_CARD_SELECTOR)) return;

    const li = document.createElement('li');
    li.dataset.dshModelMemoryCard = '';
    li.innerHTML = `
      <button class="dsh-mm-header" type="button" aria-expanded="false">
        <span class="dsh-mm-head-text">
          <span class="dsh-mm-title">模型思考等级与偏好记忆</span>
          <span class="dsh-mm-desc">配置自定义模型思考档位与跨会话记忆</span>
        </span>
        <span class="dsh-mm-chevron">▾</span>
      </button>
      <div class="dsh-mm-body" style="display:none;"></div>
    `;

    const headerBtn = li.querySelector('.dsh-mm-header');
    headerBtn?.addEventListener('click', () => {
      isCardOpen = !isCardOpen;
      headerBtn.setAttribute('aria-expanded', String(isCardOpen));
      void renderCardContent(li);
    });

    pluginList.prepend(li);
  };

  // 2. 深度内嵌到官方「模型设置」条目中（严格限定在设置面板内，绝不干扰输入框/会话浮层）
  const injectInlineModelReasoning = async () => {
    const settingsContainer = document.querySelector('[data-pane="settings"], [class*="settingsSection"], [class*="ModelsSettingsSection"], [class*="ModelSettings"]');
    if (!settingsContainer) return;

    const modelEntries = settingsContainer.querySelectorAll('[class*="modelEntry"], [class*="modelAdvanced"]');
    if (modelEntries.length === 0) return;

    if (cachedProviders.length === 0) {
      await syncConfig();
    }

    modelEntries.forEach((entry) => {
      // 双重保护：如果处于浮层或下拉菜单中，绝不注入
      if (entry.closest('[class*="overlay"], [class*="popover"], [class*="menu"], [class*="composer"]')) return;
      if (entry.hasAttribute(INLINE_INJECT_ATTR)) return;

      const inputs = entry.querySelectorAll('input[type="text"], input:not([type])');
      let matchedModel: CustomModelReasoningConfig | undefined;
      let matchedProvider: CustomProviderInfo | undefined;

      inputs.forEach((input) => {
        const val = (input as HTMLInputElement).value?.trim();
        if (!val) return;
        for (const p of cachedProviders) {
          const m = p.models.find((item) => item.id === val || item.name === val);
          if (m) {
            matchedModel = m;
            matchedProvider = p;
            break;
          }
        }
      });

      if (!matchedModel || !matchedProvider) return;

      entry.setAttribute(INLINE_INJECT_ATTR, 'true');

      const inlineBox = document.createElement('div');
      inlineBox.className = 'dsh-mm-inline-box';

      const allTiers = Array.from(new Set([...ALL_STANDARD_TIERS, ...matchedModel.supportedEffortList]));
      const chks = allTiers
        .map(
          (t) => `
        <label class="dsh-mm-chk">
          <input type="checkbox" data-inline-tier="${escapeHtml(t)}" ${matchedModel?.supportedEffortList.includes(t) ? 'checked' : ''} />
          <span>${escapeHtml(t)}</span>
        </label>
      `,
        )
        .join('');

      inlineBox.innerHTML = `
        <div class="dsh-mm-inline-top">
          <label class="dsh-mm-chk" style="font-weight:500;">
            <input type="checkbox" data-inline-enable ${matchedModel.supportsReasoningEffort ? 'checked' : ''} />
            <span>思考等级</span>
          </label>
          <button class="dsh-mm-btn dsh-mm-btn-primary" type="button" data-inline-save>保存</button>
        </div>
        <div class="dsh-mm-inline-list" data-inline-container>
          ${chks}
          <div style="display:inline-flex;align-items:center;gap:4px;">
            <input type="text" class="dsh-mm-input" placeholder="+ 自定义" data-inline-input />
            <button class="dsh-mm-btn" type="button" data-inline-add>添加</button>
          </div>
        </div>
      `;

      const addBtn = inlineBox.querySelector('[data-inline-add]');
      const customInput = inlineBox.querySelector('[data-inline-input]') as HTMLInputElement | null;
      addBtn?.addEventListener('click', () => {
        const val = customInput?.value.trim();
        if (!val) return;
        const container = inlineBox.querySelector('[data-inline-container]');
        if (!container || container.querySelector(`input[data-inline-tier="${CSS.escape(val)}"]`)) {
          if (customInput) customInput.value = '';
          return;
        }
        const lbl = document.createElement('label');
        lbl.className = 'dsh-mm-chk';
        lbl.innerHTML = `<input type="checkbox" data-inline-tier="${escapeHtml(val)}" checked /><span>${escapeHtml(val)}</span>`;
        container.insertBefore(lbl, addBtn.parentElement);
        if (customInput) customInput.value = '';
      });

      const saveBtn = inlineBox.querySelector('[data-inline-save]');
      saveBtn?.addEventListener('click', async () => {
        if (!matchedModel || !matchedProvider) return;
        const enable = (inlineBox.querySelector('[data-inline-enable]') as HTMLInputElement | null)?.checked;
        const checkedTiers: string[] = [];
        inlineBox.querySelectorAll('input[data-inline-tier]:checked').forEach((i) => {
          const t = (i as HTMLElement).dataset.inlineTier;
          if (t) checkedTiers.push(t);
        });

        if (enable && checkedTiers.length === 0) {
          checkedTiers.push('high', 'max');
        }

        try {
          if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = true;
          await callRpc('update-model-reasoning', {
            providerId: matchedProvider.id,
            modelId: matchedModel.id,
            supportsReasoningEffort: Boolean(enable),
            thinkingFormat: 'openai',
            reasoningEfforts: checkedTiers,
          });
          if (saveBtn instanceof HTMLButtonElement) {
            saveBtn.textContent = '已保存';
            setTimeout(() => {
              saveBtn.textContent = '保存';
              saveBtn.disabled = false;
            }, 1800);
          }
          await syncConfig();
        } catch {
          if (saveBtn instanceof HTMLButtonElement) {
            saveBtn.textContent = '失败';
            saveBtn.disabled = false;
          }
        }
      });

      entry.appendChild(inlineBox);
    });
  };

  ctx.effect(() => {
    const observer = new MutationObserver(() => {
      mountSettingsPluginCard();
      void injectInlineModelReasoning();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    mountSettingsPluginCard();
    void injectInlineModelReasoning();

    return () => {
      observer.disconnect();
      document.querySelectorAll(SETTINGS_CARD_SELECTOR).forEach((el) => el.remove());
      document.querySelectorAll('.dsh-mm-inline-box').forEach((el) => el.remove());
    };
  }, 'dsh-model-memory: settings lifecycle');
}
