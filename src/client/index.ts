/**
 * dsh-model-memory — Web 客户端插件
 *
 * 极简、全档位、高可靠的“思考等级配置与偏好记忆”组件：
 * 1. 深度集成在官方设置页面（模型设置项内直接注入全档位勾选；插件设置内提供备份管理面板）。
 * 2. 思考等级全覆盖：none / minimal / low / medium / high / xhigh / max + 支持自定义扩展档位。
 * 3. 提供清晰的【跨会话偏好记忆总开关】。
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
/* 插件设置页内的可折叠卡片 */
li[data-dsh-model-memory-card] {
  list-style: none;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 12px;
  transition: border-color 0.15s ease;
  font-family: inherit;
}
li[data-dsh-model-memory-card]:hover {
  border-color: var(--dsw-alias-label-dimmed, #8c959f);
}
li[data-dsh-model-memory-card] .mm-card-header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  color: inherit;
}
li[data-dsh-model-memory-card] .mm-card-head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
li[data-dsh-model-memory-card] .mm-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #1f2328);
  display: flex;
  align-items: center;
  gap: 6px;
}
li[data-dsh-model-memory-card] .mm-card-desc {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #656d76);
}
li[data-dsh-model-memory-card] .mm-card-chevron {
  font-size: 14px;
  color: var(--dsw-alias-label-tertiary, #656d76);
  transition: transform 0.2s ease;
}
li[data-dsh-model-memory-card].open .mm-card-chevron {
  transform: rotate(180deg);
}
li[data-dsh-model-memory-card] .mm-card-body {
  border-top: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  padding: 14px 16px;
  background: var(--dsw-alias-bg-layer-1, #f6f8fa);
}
li[data-dsh-model-memory-card] .mm-global-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  border-radius: 8px;
  margin-bottom: 14px;
}
li[data-dsh-model-memory-card] .mm-global-switch-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, #1f2328);
}
li[data-dsh-model-memory-card] .mm-global-switch-desc {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #656d76);
}
li[data-dsh-model-memory-card] .mm-tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  margin-bottom: 12px;
  padding-bottom: 6px;
  overflow-x: auto;
}
li[data-dsh-model-memory-card] .mm-tab {
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-weight: 500;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #656d76);
  white-space: nowrap;
}
li[data-dsh-model-memory-card] .mm-tab.active {
  background: var(--dsw-alias-brand-primary, #2d6cdf);
  color: #fff;
}
li[data-dsh-model-memory-card] .mm-model-card {
  border: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
}
li[data-dsh-model-memory-card] .mm-model-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
li[data-dsh-model-memory-card] .mm-model-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, #1f2328);
}
li[data-dsh-model-memory-card] .mm-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  font-weight: 500;
}
li[data-dsh-model-memory-card] .mm-badge.active {
  background: #dafbe1;
  color: #1a7f37;
}
li[data-dsh-model-memory-card] .mm-badge.inactive {
  background: #f6f8fa;
  color: #656d76;
}
li[data-dsh-model-memory-card] .mm-field-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 8px 0;
  flex-wrap: wrap;
}
li[data-dsh-model-memory-card] .mm-tiers {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.mm-tier-chk {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--dsw-alias-label-primary, #1f2328);
}
.mm-btn {
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 500;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  background: var(--dsw-alias-bg-layer-2, #fff);
  color: inherit;
}
.mm-btn.primary {
  background: var(--dsw-alias-brand-primary, #2d6cdf);
  color: #fff;
  border-color: transparent;
}
.mm-btn.primary:hover {
  filter: brightness(1.08);
}
.mm-msg {
  font-size: 12px;
  margin-top: 4px;
  padding: 2px 6px;
  border-radius: 4px;
}
.mm-msg.success {
  background: #dafbe1;
  color: #1a7f37;
}
.mm-empty {
  text-align: center;
  padding: 16px 10px;
  color: var(--dsw-alias-label-tertiary, #656d76);
  font-size: 12px;
}

/* 官方模型设置条目内直接注入的思考等级配置行 */
.dsh-mm-inline-field {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-3, rgba(0,0,0,0.02));
  border: 1px dashed var(--dsw-alias-border-l2, #d0d7de);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsh-mm-inline-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.dsh-mm-inline-tiers {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.mm-custom-input {
  width: 70px;
  padding: 2px 6px;
  font-size: 11px;
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2, #fff);
}
`;

function escapeHtml(value: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (char) => map[char] ?? char);
}

export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as unknown as ConnectionHandle | undefined;
  const logger = ctx.logger('dsh-model-memory-client');

  const style = document.createElement('style');
  style.textContent = cssText;
  document.head.append(style);

  let activeProviderIndex = 0;
  let cachedProviders: CustomProviderInfo[] = [];
  let isCardOpen = false;
  let memoryEnabled = true;

  const callRpc = async (endpoint: string, payload: unknown = {}): Promise<any> => {
    if (!connection?.rpc) {
      throw new Error('RPC connection not available');
    }
    const res = (await connection.rpc.call('/model-memory', endpoint, payload)) as any;
    if (res && res.ok) {
      return res.value;
    }
    throw new Error(res?.error?.message || 'RPC call failed');
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

  // 生成档位勾选 HTML
  const buildTiersHtml = (supportedList: string[], modelId: string) => {
    // 合并标准档位和已有的自定义档位
    const allTiers = Array.from(new Set([...ALL_STANDARD_TIERS, ...supportedList]));
    const chks = allTiers
      .map((tier) => {
        const checked = supportedList.includes(tier) ? 'checked' : '';
        return `
        <label class="mm-tier-chk">
          <input type="checkbox" data-tier="${escapeHtml(tier)}" data-model="${escapeHtml(modelId)}" ${checked} />
          <span>${escapeHtml(tier)}</span>
        </label>
      `;
      })
      .join('');

    return `
      ${chks}
      <div style="display:inline-flex;align-items:center;gap:4px;margin-left:4px;">
        <input type="text" class="mm-custom-input" placeholder="+ 自定义" data-custom-tier-input="${escapeHtml(modelId)}" />
        <button class="mm-btn" type="button" data-add-custom-tier="${escapeHtml(modelId)}" style="padding:1px 6px;font-size:11px;">添加</button>
      </div>
    `;
  };

  // 1. 渲染插件设置页内的可折叠卡片
  const renderCardContent = async (container: HTMLElement) => {
    const bodyEl = container.querySelector('.mm-card-body') as HTMLElement | null;
    if (!bodyEl) return;

    if (!isCardOpen) {
      bodyEl.style.display = 'none';
      container.classList.remove('open');
      return;
    }

    bodyEl.style.display = 'block';
    container.classList.add('open');
    bodyEl.innerHTML = '<div class="mm-empty">正在读取思考等级配置...</div>';

    await syncConfig();

    const switchHtml = `
      <div class="mm-global-switch">
        <div>
          <div class="mm-global-switch-title">🧠 跨会话偏好记忆</div>
          <div class="mm-global-switch-desc">${memoryEnabled ? '已开启（新建会话或切换渠道时，自动记住并回填各渠道最后使用的模型与思考档位）' : '已暂停（不自动记忆跨会话思考档位）'}</div>
        </div>
        <label class="mm-tier-chk" style="font-weight:600;font-size:13px;">
          <input type="checkbox" data-global-memory-switch ${memoryEnabled ? 'checked' : ''} />
          <span>${memoryEnabled ? '已开启' : '已关闭'}</span>
        </label>
      </div>
    `;

    if (cachedProviders.length === 0) {
      bodyEl.innerHTML = `
        ${switchHtml}
        <div class="mm-empty">
          <p>暂无自定义 API 渠道。</p>
          <p style="font-size:11px;color:#656d76;">请在官方模型设置中添加自定义 API 渠道与模型后在此管理思考等级。</p>
        </div>
      `;
      bindSwitchEvents(bodyEl, container);
      return;
    }

    if (activeProviderIndex >= cachedProviders.length) {
      activeProviderIndex = 0;
    }

    const currentProvider = cachedProviders[activeProviderIndex];
    if (!currentProvider) return;

    const tabsHtml = cachedProviders
      .map(
        (p, idx) =>
          `<button class="mm-tab ${idx === activeProviderIndex ? 'active' : ''}" type="button" data-tab-idx="${idx}">${escapeHtml(p.displayName || p.id)}</button>`,
      )
      .join('');

    const modelsHtml =
      currentProvider.models.length === 0
        ? '<div class="mm-empty">该渠道暂无模型。</div>'
        : currentProvider.models
            .map((m) => {
              return `
          <div class="mm-model-card" data-model-id="${escapeHtml(m.id)}">
            <div class="mm-model-head">
              <div class="mm-model-title">📦 ${escapeHtml(m.name || m.id)}</div>
              <span class="mm-badge ${m.supportsReasoningEffort ? 'active' : 'inactive'}">
                ${m.supportsReasoningEffort ? '✓ 思考等级已启用' : '○ 未启用'}
              </span>
            </div>
            <div class="mm-field-row">
              <label class="mm-tier-chk" style="font-weight:600;">
                <input type="checkbox" data-enable-reasoning data-model="${escapeHtml(m.id)}" ${m.supportsReasoningEffort ? 'checked' : ''} />
                <span>启用思考等级 (supportsReasoningEffort)</span>
              </label>
            </div>
            <div class="mm-field-row">
              <span style="font-size:12px;color:var(--dsw-alias-label-secondary);min-width:60px;">档位:</span>
              <div class="mm-tiers" data-tiers-container="${escapeHtml(m.id)}">
                ${buildTiersHtml(m.supportedEffortList, m.id)}
              </div>
            </div>
            <div style="margin-top:8px;display:flex;align-items:center;gap:10px;">
              <button class="mm-btn primary" type="button" data-save-btn data-model="${escapeHtml(m.id)}">💾 保存</button>
              <span class="mm-msg" data-msg="${escapeHtml(m.id)}" style="display:none;"></span>
            </div>
          </div>
        `;
            })
            .join('');

    bodyEl.innerHTML = `
      ${switchHtml}
      <div class="mm-tabs">${tabsHtml}</div>
      <div class="mm-models-list">${modelsHtml}</div>
    `;

    bindSwitchEvents(bodyEl, container);

    bodyEl.querySelectorAll('[data-tab-idx]').forEach((el) => {
      el.addEventListener('click', (e) => {
        activeProviderIndex = Number((e.currentTarget as HTMLElement).dataset.tabIdx || 0);
        void renderCardContent(container);
      });
    });

    // 添加自定义档位
    bodyEl.querySelectorAll('[data-add-custom-tier]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const modelId = (btn as HTMLElement).dataset.addCustomTier || '';
        const input = bodyEl.querySelector(`input[data-custom-tier-input="${CSS.escape(modelId)}"]`) as HTMLInputElement | null;
        const tierName = input?.value.trim();
        if (!tierName) return;

        const tiersContainer = bodyEl.querySelector(`[data-tiers-container="${CSS.escape(modelId)}"]`);
        if (!tiersContainer) return;

        // 检查是否已有
        if (tiersContainer.querySelector(`input[data-tier="${CSS.escape(tierName)}"]`)) {
          input!.value = '';
          return;
        }

        const newLabel = document.createElement('label');
        newLabel.className = 'mm-tier-chk';
        newLabel.innerHTML = `<input type="checkbox" data-tier="${escapeHtml(tierName)}" data-model="${escapeHtml(modelId)}" checked /><span>${escapeHtml(tierName)}</span>`;
        tiersContainer.insertBefore(newLabel, btn.parentElement);
        input!.value = '';
      });
    });

    bodyEl.querySelectorAll('[data-save-btn]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const modelId = (e.currentTarget as HTMLElement).dataset.model || '';
        const card = bodyEl.querySelector(`.mm-model-card[data-model-id="${CSS.escape(modelId)}"]`);
        if (!card) return;

        const enableChk = card.querySelector('[data-enable-reasoning]') as HTMLInputElement | null;
        const tierInputs = card.querySelectorAll('input[data-tier]:checked');
        const msgEl = card.querySelector(`[data-msg="${CSS.escape(modelId)}"]`) as HTMLElement | null;

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
            msgEl.textContent = '✅ 已保存生效！';
            msgEl.className = 'mm-msg success';
            msgEl.style.display = 'inline-block';
            setTimeout(() => {
              if (msgEl) msgEl.style.display = 'none';
            }, 2500);
          }
          await renderCardContent(container);
        } catch (err: any) {
          if (msgEl) {
            msgEl.textContent = '❌ 保存失败: ' + err.message;
            msgEl.className = 'mm-msg';
            msgEl.style.display = 'inline-block';
          }
        } finally {
          if (btn instanceof HTMLButtonElement) btn.disabled = false;
        }
      });
    });
  };

  const bindSwitchEvents = (bodyEl: HTMLElement, container: HTMLElement) => {
    const memorySwitch = bodyEl.querySelector('[data-global-memory-switch]') as HTMLInputElement | null;
    memorySwitch?.addEventListener('change', async () => {
      const nextVal = Boolean(memorySwitch.checked);
      try {
        await callRpc('toggle-memory', { enabled: nextVal });
        memoryEnabled = nextVal;
        void renderCardContent(container);
      } catch (err: any) {
        logger.error('Toggle memory failed: ' + String(err));
      }
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
      <button class="mm-card-header" type="button" aria-expanded="false">
        <span class="mm-card-head-text">
          <span class="mm-card-title">🧠 自定义模型思考等级管理</span>
          <span class="mm-card-desc">配置自定义 API 渠道模型的思考档位（none / minimal / low / medium / high / xhigh / max），跨会话持久记忆。</span>
        </span>
        <span class="mm-card-chevron">▾</span>
      </button>
      <div class="mm-card-body" style="display:none;"></div>
    `;

    const headerBtn = li.querySelector('.mm-card-header');
    headerBtn?.addEventListener('click', () => {
      isCardOpen = !isCardOpen;
      headerBtn.setAttribute('aria-expanded', String(isCardOpen));
      void renderCardContent(li);
    });

    pluginList.prepend(li);
  };

  // 2. 深度嵌入官方“模型设置”条目中（每个自定义模型卡片下方挂载全档位思考等级栏）
  const injectInlineModelReasoning = async () => {
    const modelEntries = document.querySelectorAll('[class*="modelEntry"], [class*="modelAdvanced"], [class*="rowCard"]');
    if (modelEntries.length === 0) return;

    if (cachedProviders.length === 0) {
      await syncConfig();
    }

    modelEntries.forEach((entry) => {
      if (entry.hasAttribute(INLINE_INJECT_ATTR)) return;

      // 提取该条目的模型 ID
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
      inlineBox.className = 'dsh-mm-inline-field';

      const allTiers = Array.from(new Set([...ALL_STANDARD_TIERS, ...matchedModel.supportedEffortList]));
      const chks = allTiers
        .map(
          (t) => `
        <label class="mm-tier-chk">
          <input type="checkbox" data-mm-inline-tier="${escapeHtml(t)}" ${matchedModel?.supportedEffortList.includes(t) ? 'checked' : ''} />
          <span>${escapeHtml(t)}</span>
        </label>
      `,
        )
        .join('');

      inlineBox.innerHTML = `
        <div class="dsh-mm-inline-head">
          <label class="mm-tier-chk" style="font-weight:600;">
            <input type="checkbox" data-mm-inline-enable ${matchedModel.supportsReasoningEffort ? 'checked' : ''} />
            <span>🧠 启用思考等级</span>
          </label>
          <button class="mm-btn primary" type="button" data-mm-inline-save style="padding:2px 8px;font-size:11px;">保存思考档位</button>
        </div>
        <div class="dsh-mm-inline-tiers" data-inline-tiers-container>
          ${chks}
          <div style="display:inline-flex;align-items:center;gap:4px;">
            <input type="text" class="mm-custom-input" placeholder="+ 自定义" data-inline-custom-input />
            <button class="mm-btn" type="button" data-inline-add-custom style="padding:1px 6px;font-size:11px;">添加</button>
          </div>
        </div>
      `;

      // 绑定内嵌自定义档位添加
      const addCustomBtn = inlineBox.querySelector('[data-inline-add-custom]');
      const customInput = inlineBox.querySelector('[data-inline-custom-input]') as HTMLInputElement | null;
      addCustomBtn?.addEventListener('click', () => {
        const val = customInput?.value.trim();
        if (!val) return;
        const container = inlineBox.querySelector('[data-inline-tiers-container]');
        if (!container || container.querySelector(`input[data-mm-inline-tier="${CSS.escape(val)}"]`)) {
          if (customInput) customInput.value = '';
          return;
        }
        const lbl = document.createElement('label');
        lbl.className = 'mm-tier-chk';
        lbl.innerHTML = `<input type="checkbox" data-mm-inline-tier="${escapeHtml(val)}" checked /><span>${escapeHtml(val)}</span>`;
        container.insertBefore(lbl, addCustomBtn.parentElement);
        if (customInput) customInput.value = '';
      });

      const saveBtn = inlineBox.querySelector('[data-mm-inline-save]');
      saveBtn?.addEventListener('click', async () => {
        if (!matchedModel || !matchedProvider) return;
        const enable = (inlineBox.querySelector('[data-mm-inline-enable]') as HTMLInputElement | null)?.checked;
        const checkedTiers: string[] = [];
        inlineBox.querySelectorAll('input[data-mm-inline-tier]:checked').forEach((i) => {
          const t = (i as HTMLElement).dataset.mmInlineTier;
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
            saveBtn.textContent = '✅ 已保存';
            setTimeout(() => {
              saveBtn.textContent = '保存思考档位';
              saveBtn.disabled = false;
            }, 2000);
          }
          await syncConfig();
        } catch {
          if (saveBtn instanceof HTMLButtonElement) {
            saveBtn.textContent = '❌ 失败';
            saveBtn.disabled = false;
          }
        }
      });

      entry.appendChild(inlineBox);
    });
  };

  ctx.effect(() => {
    logger.info('dsh-model-memory 思考等级配置就绪');

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
      document.querySelectorAll('.dsh-mm-inline-field').forEach((el) => el.remove());
    };
  }, 'dsh-model-memory: settings lifecycle');
}
