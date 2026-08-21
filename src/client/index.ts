/**
 * dsh-model-memory — Web 客户端插件
 *
 * 遵循 DSH 原生设计语言与 CSS 变量规范，无表情符号，克制精炼。
 *
 * 修复记录（v0.1.5）：
 * - 设置卡片改挂官方槽位 settings.plugin.item（设置 → 插件 → 可配置），
 *   彻底移除 MutationObserver 猜测式 DOM 挂载——旧实现用 ul[class*="cards"]
 *   匹配宿主列表，官方任何带 cards 类名的页面（如 Agent 预设）都会被误注入；
 * - 内嵌模型行注入保留数据锚点方案（modelEntry 全系统唯一 + 输入框值精确匹配）。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import { useState, useEffect, useCallback } from 'react';
import { jsx as j, jsxs as js } from 'react/jsx-runtime';

export const name = 'dsh-model-memory-client';
export const inject = ['connection', 'slots'] as const;

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
  rememberedEffort?: string;
}

interface CustomProviderInfo {
  id: string;
  displayName: string;
  baseURL?: string;
  api?: string;
  models: CustomModelReasoningConfig[];
}

type CallRpc = (endpoint: string, payload?: unknown) => Promise<any>;

interface SlotRegistrationOptions {
  name: string;
  key?: string;
  id?: string;
  order?: number;
  locale?: string;
  inject?: () => unknown;
}

interface SlotsFace {
  inject(slot: string, factory: () => unknown): unknown;
  register(options: SlotRegistrationOptions, component: (props: any) => any): unknown;
}

interface TierDraft {
  enabled: boolean;
  tiers: string[];
}

const cssText = [
  "/* 插件设置卡片样式：完全与 DSH 官方设计规范对齐 */",
  "li[data-dsh-model-memory-card] { list-style: none; background: var(--dsw-alias-bg-layer-3); border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; overflow: hidden; margin-bottom: 8px; transition: border-color 0.16s, background 0.16s; font-family: inherit; color: var(--dsw-alias-label-primary); }",
  "li[data-dsh-model-memory-card]:hover { border-color: var(--dsw-alias-label-dimmed); }",
  "li[data-dsh-model-memory-card].open { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-label-dimmed); }",
  "li[data-dsh-model-memory-card] .dsh-mm-header { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: none; border: 0; cursor: pointer; text-align: left; color: inherit; }",
  "li[data-dsh-model-memory-card] .dsh-mm-head-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }",
  "li[data-dsh-model-memory-card] .dsh-mm-title { font-size: 14px; font-weight: 500; color: var(--dsw-alias-label-primary); line-height: 20px; }",
  "li[data-dsh-model-memory-card] .dsh-mm-desc { font-size: 12px; color: var(--dsw-alias-label-tertiary); line-height: 18px; }",
  "li[data-dsh-model-memory-card] .dsh-mm-chevron { font-size: 12px; color: var(--dsw-alias-label-tertiary); transition: transform 0.16s ease; flex: none; }",
  "li[data-dsh-model-memory-card].open .dsh-mm-chevron { transform: rotate(180deg); }",
  "li[data-dsh-model-memory-card] .dsh-mm-body { border-top: 1px solid var(--dsw-alias-border-l2); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }",
  "li[data-dsh-model-memory-card] .dsh-mm-switch-row { display: flex; align-items: center; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--dsw-alias-border-l2); }",
  "li[data-dsh-model-memory-card] .dsh-mm-switch-label { font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary); }",
  "li[data-dsh-model-memory-card] .dsh-mm-switch-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary); }",
  "li[data-dsh-model-memory-card] .dsh-mm-tabs { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }",
  "li[data-dsh-model-memory-card] .dsh-mm-tab { padding: 3px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: 0 0; cursor: pointer; font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }",
  "li[data-dsh-model-memory-card] .dsh-mm-tab:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }",
  "li[data-dsh-model-memory-card] .dsh-mm-tab.active { background: var(--dsw-alias-interactive-bg-hover-solid, var(--dsw-alias-bg-module-platform)); color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); }",
  "li[data-dsh-model-memory-card] .dsh-mm-model-row { border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 10px 12px; background: var(--dsw-alias-bg-layer-1); display: flex; flex-direction: column; gap: 8px; }",
  "li[data-dsh-model-memory-card] .dsh-mm-model-head { display: flex; justify-content: space-between; align-items: center; }",
  "li[data-dsh-model-memory-card] .dsh-mm-model-id { font-family: var(--ds-font-family-code, monospace); font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary); }",
  "li[data-dsh-model-memory-card] .dsh-mm-badge { font-size: 11px; padding: 1px 6px; border-radius: 999px; line-height: 16px; background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l3); }",
  "li[data-dsh-model-memory-card] .dsh-mm-badge.active { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }",
  "li[data-dsh-model-memory-card] .dsh-mm-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }",
  ".dsh-mm-chk { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; font-size: 12px; color: var(--dsw-alias-label-primary); user-select: none; }",
  ".dsh-mm-btn { box-sizing: border-box; height: 26px; font: inherit; cursor: pointer; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; padding: 0 10px; font-size: 12px; line-height: 24px; color: var(--dsw-alias-label-primary); background: 0 0; display: inline-flex; align-items: center; justify-content: center; }",
  ".dsh-mm-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }",
  ".dsh-mm-btn:disabled { opacity: .4; cursor: default; }",
  ".dsh-mm-btn-primary { background: var(--dsw-alias-button-primary-fill, #2d6cdf); color: var(--dsw-alias-label-primary-foreground, #fff); border-color: transparent; }",
  ".dsh-mm-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover, #2558b8); }",
  ".dsh-mm-input { box-sizing: border-box; height: 26px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); padding: 0 8px; font-size: 12px; width: 80px; }",
  ".dsh-mm-input:focus { border-color: var(--dsw-alias-brand-primary); outline: none; }",
  ".dsh-mm-status-text { font-size: 12px; color: var(--dsw-alias-state-success-primary); }",
  "/* 官方模型设置条目直接嵌入样式 */",
  ".dsh-mm-inline-box { margin-top: 8px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); display: flex; flex-direction: column; gap: 6px; }",
  ".dsh-mm-inline-top { display: flex; justify-content: space-between; align-items: center; }",
  ".dsh-mm-inline-list { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }",
].join('\n');

const draftKey = (providerId: string, modelId: string): string => providerId + '/' + modelId;

/**
 * 设置卡片（React 组件）：经官方 settings.plugin.item 槽位渲染，
 * 不再自行操作 DOM 挂载点。
 */
function ModelMemoryCard(props: { callRpc: CallRpc }): any {
  const { callRpc } = props;
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<CustomProviderInfo[]>([]);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, TierDraft>>({});
  const [extras, setExtras] = useState<Record<string, string[]>>({});
  const [customInput, setCustomInput] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState('');
  const [notice, setNotice] = useState<{ key: string; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, status] = await Promise.all([
        callRpc('list-providers'),
        callRpc('status').catch(() => ({ enabled: true })),
      ]);
      setProviders(Array.isArray(list) ? list : []);
      setMemoryEnabled((status as any)?.enabled ?? true);
    } catch {
      // RPC 未就绪时保留空态
    }
  }, [callRpc]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const getDraft = (pid: string, m: CustomModelReasoningConfig): TierDraft => {
    const k = draftKey(pid, m.id);
    // 默认档位：从未配置过的模型默认全选标准档位；已配置的保持已存集合
    return drafts[k] ?? { enabled: m.supportsReasoningEffort, tiers: m.supportedEffortList.length > 0 ? [...m.supportedEffortList] : [...ALL_STANDARD_TIERS] };
  };

  const allTiers = (pid: string, m: CustomModelReasoningConfig): string[] => {
    const k = draftKey(pid, m.id);
    return Array.from(new Set([...ALL_STANDARD_TIERS, ...m.supportedEffortList, ...(extras[k] ?? [])]));
  };

  const setDraft = (pid: string, modelId: string, next: TierDraft): void => {
    const k = draftKey(pid, modelId);
    setDrafts((prev) => ({ ...prev, [k]: next }));
  };

  const saveModel = async (pid: string, m: CustomModelReasoningConfig): Promise<void> => {
    const k = draftKey(pid, m.id);
    const draft = getDraft(pid, m);
    const tiers = [...draft.tiers];
    if (draft.enabled && tiers.length === 0) tiers.push('high', 'max');

    setBusyKey(k);
    try {
      await callRpc('update-model-reasoning', {
        providerId: pid,
        modelId: m.id,
        supportsReasoningEffort: draft.enabled,
        thinkingFormat: 'openai',
        reasoningEfforts: tiers,
      });
      setNotice({ key: k, text: '已保存' });
      setTimeout(() => setNotice((cur) => (cur?.key === k ? null : cur)), 2000);
      // 清掉本地草稿，让 UI 回到刚保存的服务端状态
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
      setExtras((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
      await refresh();
    } catch (err: any) {
      setNotice({ key: k, text: '保存失败: ' + String(err?.message ?? err) });
      setTimeout(() => setNotice((cur) => (cur?.key === k ? null : cur)), 4000);
    } finally {
      setBusyKey('');
    }
  };

  const active = Math.min(activeIdx, Math.max(providers.length - 1, 0));
  const current = providers.length > 0 ? providers[active] : undefined;

  const bodyChildren: any[] = [];

  bodyChildren.push(js('div', { className: 'dsh-mm-switch-row', children: [
    js('div', { children: [
      j('div', { className: 'dsh-mm-switch-label', children: '偏好记忆' }),
      j('div', { className: 'dsh-mm-switch-hint', children: memoryEnabled ? '已开启跨会话模型与思考档位记忆' : '已暂停记忆' }),
    ] }),
    js('label', { className: 'dsh-mm-chk', children: [
      j('input', {
        type: 'checkbox',
        checked: memoryEnabled,
        onChange: async (e: any) => {
          const next = Boolean(e.target.checked);
          try {
            await callRpc('toggle-memory', { enabled: next });
            setMemoryEnabled(next);
          } catch {
            // 保持原状态
          }
        },
      }),
      j('span', { children: memoryEnabled ? '启用' : '关闭' }),
    ] }),
  ] }));

  if (providers.length === 0) {
    bodyChildren.push(j('div', {
      style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', padding: '4px 0' },
      children: '暂无自定义 API 渠道。请在模型设置中添加渠道与模型。',
    }));
  } else if (current) {
    bodyChildren.push(j('div', {
      className: 'dsh-mm-tabs',
      children: providers.map((p, idx) => j('button', {
        key: p.id,
        className: 'dsh-mm-tab' + (idx === active ? ' active' : ''),
        type: 'button',
        onClick: () => setActiveIdx(idx),
        children: p.displayName || p.id,
      })),
    }));

    const modelRows = current.models.length === 0
      ? [j('div', { key: '_empty', style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' }, children: '该渠道暂无模型。' })]
      : current.models.map((m) => {
          const k = draftKey(current.id, m.id);
          const draft = getDraft(current.id, m);
          const tiers = allTiers(current.id, m);
          return js('div', { key: m.id, className: 'dsh-mm-model-row', 'data-model-id': m.id, children: [
            js('div', { className: 'dsh-mm-model-head', children: [
              j('span', { className: 'dsh-mm-model-id', children: m.id }),
              j('span', { className: 'dsh-mm-badge' + (draft.enabled ? ' active' : ''), children: draft.enabled ? '思考已启用' : '未启用' }),
            ] }),
            js('div', { className: 'dsh-mm-controls', children: [
              js('label', { className: 'dsh-mm-chk', style: { fontWeight: 500 }, children: [
                j('input', {
                  type: 'checkbox',
                  checked: draft.enabled,
                  onChange: (e: any) => setDraft(current.id, m.id, { ...draft, enabled: Boolean(e.target.checked) }),
                }),
                j('span', { children: '启用思考能力' }),
              ] }),
            ] }),
            j('div', {
              className: 'dsh-mm-controls',
              children: [
                ...tiers.map((t) => js('label', { key: t, className: 'dsh-mm-chk', children: [
                  j('input', {
                    type: 'checkbox',
                    checked: draft.tiers.includes(t),
                    onChange: (e: any) => {
                      const nextTiers = e.target.checked ? [...draft.tiers, t] : draft.tiers.filter((x) => x !== t);
                      setDraft(current.id, m.id, { ...draft, tiers: nextTiers });
                    },
                  }),
                  j('span', { children: t }),
                ] })),
                js('div', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' }, children: [
                  j('input', {
                    className: 'dsh-mm-input',
                    placeholder: '+ 自定义',
                    value: customInput[k] ?? '',
                    onInput: (e: any) => setCustomInput((prev) => ({ ...prev, [k]: e.target.value })),
                  }),
                  j('button', {
                    className: 'dsh-mm-btn',
                    type: 'button',
                    onClick: () => {
                      const val = (customInput[k] ?? '').trim();
                      if (!val) return;
                      if (tiers.includes(val)) {
                        setCustomInput((prev) => ({ ...prev, [k]: '' }));
                        return;
                      }
                      setExtras((prev) => ({ ...prev, [k]: [...(prev[k] ?? []), val] }));
                      setDraft(current.id, m.id, { ...draft, tiers: [...draft.tiers, val] });
                      setCustomInput((prev) => ({ ...prev, [k]: '' }));
                    },
                    children: '添加',
                  }),
                  j('button', {
                    className: 'dsh-mm-btn',
                    type: 'button',
                    onClick: () => {
                      const allChecked = tiers.every((t) => draft.tiers.includes(t));
                      setDraft(current.id, m.id, { ...draft, tiers: allChecked ? [] : [...tiers] });
                    },
                    children: tiers.every((t) => draft.tiers.includes(t)) ? '取消全选' : '全选',
                  }),
                ] }),
              ],
            }),
            js('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }, children: [
              j('button', {
                className: 'dsh-mm-btn dsh-mm-btn-primary',
                type: 'button',
                disabled: busyKey === k,
                onClick: () => void saveModel(current.id, m),
                children: busyKey === k ? '保存中…' : '保存',
              }),
              notice?.key === k ? j('span', { className: 'dsh-mm-status-text', children: notice.text }) : null,
            ] }),
          ] }, k);
        });

    bodyChildren.push(js('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' }, children: modelRows }));
  }

  return js('li', { 'data-dsh-model-memory-card': '', className: open ? 'open' : undefined, children: [
    js('button', {
      className: 'dsh-mm-header',
      type: 'button',
      'aria-expanded': open,
      onClick: () => setOpen((v) => !v),
      children: [
        js('span', { className: 'dsh-mm-head-text', children: [
          j('span', { className: 'dsh-mm-title', children: '模型思考等级与偏好记忆' }),
          j('span', { className: 'dsh-mm-desc', children: '配置自定义模型思考档位与跨会话记忆' }),
        ] }),
        j('span', { className: 'dsh-mm-chevron', children: '▾' }),
      ],
    }),
    open ? j('div', { className: 'dsh-mm-body', children: bodyChildren }) : null,
  ] });
}

export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as unknown as ConnectionHandle | undefined;
  const slots = ctx.get('slots') as unknown as SlotsFace | undefined;

  const style = document.createElement('style');
  style.textContent = cssText;
  document.head.append(style);

  let cachedProviders: CustomProviderInfo[] = [];

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
      cachedProviders = (await callRpc('list-providers')) || [];
      return cachedProviders;
    } catch {
      return cachedProviders;
    }
  };

  // 会话内即时恢复：官方切换模型时先定会话状态再持久化，宿主端注入的档位
  // 只影响“下次会话的默认”，当前会话界面不会显示。这里包装共享的
  // api.sessions.selectModel（ui-model-selection 动态查找该方法，包装对
  // 所有调用方生效）：若本次选择未带档位且该模型有记忆档位，则自动补一次
  // 带档位的选择。同模型不带档位视为显式清除 -> 通知宿主删除记忆。
  const rememberedFor = (providerId: string, modelId: string): string | undefined => {
    const p = cachedProviders.find((item) => item.id === providerId);
    return p?.models.find((m) => m.id === modelId || m.name === modelId)?.rememberedEffort;
  };

  // 会话内即时恢复：官方切换模型时先定会话状态再持久化，宿主端注入的档位
  // 只影响「下次会话的默认」，当前会话界面不会显示。这里包装共享的
  // api.sessions.selectModel（ui-model-selection 动态查找该方法，包装对
  // 所有调用方生效）：若本次选择未带档位且记忆中有档位，则立即补一次带档位的
  // 选择。记忆从 list-providers 缓存读取（零额外往返）；协议层无法区分
  // 「选模型」与「显式选默认档位」，故这里不做自动清除，清除走插件卡片。
  const wireSessionSelectModel = () => {
    const api = (connection as unknown as { api?: { sessions?: Record<string, unknown> } } | undefined)?.api;
    const originalSelectModel = api?.sessions?.selectModel;
    if (typeof originalSelectModel !== 'function') return;
    api!.sessions!.selectModel = async (payload: any, signal?: AbortSignal) => {
      if (cachedProviders.length === 0) {
        void syncConfig();
      }
      const res = await (originalSelectModel as (p: any, s?: AbortSignal) => Promise<any>)(payload, signal);
      try {
        // callUnary 包络形状是 { rpcId, result: { ok, value } | { error } }
        const result = res && typeof res === 'object' ? (res as any).result : undefined;
        const selected = result && result.ok && result.value ? result.value.selected : undefined;
        if (
          selected &&
          selected.reasoningEffort === undefined &&
          payload && payload.provider && payload.model &&
          typeof payload.reasoningEffort !== 'string'
        ) {
          const remembered = rememberedFor(selected.provider, selected.model);
          if (remembered) {
            const followUp = await (originalSelectModel as (p: any, s?: AbortSignal) => Promise<any>)(
              { ...payload, reasoningEffort: remembered },
              signal,
            );
            const followResult = followUp && typeof followUp === 'object' ? (followUp as any).result : undefined;
            if (followResult && followResult.ok && followResult.value && followResult.value.selected) {
              return followUp;
            }
            // 补选失败（例如该模型已不支持记忆的档位）：保留原始结果
          }
        }
      } catch {
        // 记忆查询或补选失败：静默回退到原始结果
      }
      return res;
    };
  };

  wireSessionSelectModel();
  void syncConfig();

  // 深度内嵌到官方「模型设置」条目中。
  // v0.1.4：不依赖设置页容器类名做外层限定（官方前端改版会漂移：
  // 2026-08-21 的 dsh 更新移除了 settingsSection/data-pane 等全部旧标记，
  // 导致内嵌注入静默失效）。改为双重数据锚点：
  //   a) [class*="modelEntry"] 经全量扫描确认只存在于官方模型设置页；
  //   b) 注入前仍要求行内文本输入框的值精确等于本插件的自定义模型 id。
  // 两关都过才会渲染，官方改类名不会导致误注入，只会安全地不渲染。
  const injectInlineModelReasoning = async () => {
    const modelEntries = document.querySelectorAll('[class*="modelEntry"], [class*="modelAdvanced"]');
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
      const chks = allTiers.map((t) => {
        // 默认档位：从未配置过的模型默认全选；已配置的保持已存集合
        const checked = (matchedModel && matchedModel.supportedEffortList.length > 0 ? matchedModel.supportedEffortList.includes(t) : true) ? ' checked' : '';
        return '<label class="dsh-mm-chk"><input type="checkbox" data-inline-tier="' + escapeHtml(t) + '"' + checked + ' /><span>' + escapeHtml(t) + '</span></label>';
      }).join('');

      inlineBox.innerHTML = ''
        + '<div class="dsh-mm-inline-top">'
        + '<label class="dsh-mm-chk" style="font-weight:500;">'
        + '<input type="checkbox" data-inline-enable' + (matchedModel.supportsReasoningEffort ? ' checked' : '') + ' />'
        + '<span>思考等级</span></label>'
        + '<button class="dsh-mm-btn dsh-mm-btn-primary" type="button" data-inline-save>保存</button>'
        + '</div>'
        + '<div class="dsh-mm-inline-list" data-inline-container>'
        + chks
        + '<div style="display:inline-flex;align-items:center;gap:4px;">'
        + '<input type="text" class="dsh-mm-input" placeholder="+ 自定义" data-inline-input />'
        + '<button class="dsh-mm-btn" type="button" data-inline-add>添加</button>'
        + '<button class="dsh-mm-btn" type="button" data-inline-toggle-all>全选/取消全选</button>'
        + '</div>'
        + '</div>';

      const addBtn = inlineBox.querySelector('[data-inline-add]');
      const customInputEl = inlineBox.querySelector('[data-inline-input]') as HTMLInputElement | null;
      addBtn?.addEventListener('click', () => {
        const val = customInputEl?.value.trim();
        if (!val) return;
        const container = inlineBox.querySelector('[data-inline-container]');
        const dup = container ? container.querySelector('input[data-inline-tier="' + CSS.escape(val) + '"]') : null;
        if (!container || dup) {
          if (customInputEl) customInputEl.value = '';
          return;
        }
        const lbl = document.createElement('label');
        lbl.className = 'dsh-mm-chk';
        lbl.innerHTML = '<input type="checkbox" data-inline-tier="' + escapeHtml(val) + '" checked /><span>' + escapeHtml(val) + '</span>';
        container.insertBefore(lbl, addBtn.parentElement);
        if (customInputEl) customInputEl.value = '';
      });

      const toggleAllBtn = inlineBox.querySelector('[data-inline-toggle-all]');
      toggleAllBtn?.addEventListener('click', () => {
        const boxes = Array.from(inlineBox.querySelectorAll('input[data-inline-tier]')) as HTMLInputElement[];
        const allChecked = boxes.length > 0 && boxes.every((b) => b.checked);
        boxes.forEach((b) => { b.checked = !allChecked; });
        toggleAllBtn.textContent = allChecked ? '全选' : '取消全选';
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
      void injectInlineModelReasoning();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    void injectInlineModelReasoning();

    return () => {
      observer.disconnect();
      document.querySelectorAll('.dsh-mm-inline-box').forEach((el) => el.remove());
    };
  }, 'dsh-model-memory: settings lifecycle');

  // 设置卡片：挂官方槽位（设置 → 插件 → 可配置标签页）。
  // 渲染条件 = Host 服务 dsh-model-memory 命名空间 ∩ 本卡片声明的 key，
  // 因此不会再出现在 Agent 预设等任何其它页面。
  if (slots) {
    slots.inject('settings.plugin.item', () =>
      slots.register(
        {
          name: 'settings.plugin.item',
          key: 'dsh-model-memory',
          id: 'dsh-model-memory',
          order: 130,
          inject: () => ({}),
        },
        (slotProps: any) => j(ModelMemoryCard, { callRpc, ...(typeof slotProps === 'object' && slotProps !== null ? slotProps : {}) }),
      ),
    );
  }
}

function escapeHtml(value: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (char) => map[char] ?? char);
}

