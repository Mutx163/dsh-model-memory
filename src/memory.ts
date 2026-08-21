/**
 * dsh-model-memory — 记忆协调服务
 */
import type { Context } from '@deepseek-ai/cordis';
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import type { ModelMemoryConfig, ModelMemoryStatusView, ModelSelectionPayload } from './types.ts';
import { MemoryStore } from './store.ts';

export type LlmServiceLike = {
  listProviders?(): { id: string; name: string }[];
  listModels?(provider: string): Promise<{ provider: string; id: string; name: string }[]>;
  resolveModelInfo?(provider: string, model: string, signal?: AbortSignal): Promise<{
    provider: string;
    id: string;
    name: string;
    reasoning?: { efforts: { id: string }[]; defaultEffort?: string };
  }>;
};

export type AgentDefaultModelLike = {
  currentSelection(): { provider: string; model: string; reasoningEffort?: string };
  saveSelection(next: { provider: string; model: string; reasoningEffort?: string }): Promise<void>;
};

export type HostContext = Context & {
  connection?: HostConnectionHandle;
  llm?: LlmServiceLike;
  agentDefaultModel?: AgentDefaultModelLike;
  /** 宿主 settings 服务（dsh-settings SettingsProvider 的最小写入面） */
  settings?: {
    mutate(namespace: string, ops: { op: 'set' | 'unset'; path: string[]; value?: unknown }[]): Promise<void>;
    replace(namespace: unknown, value: unknown): Promise<void>;
  };
};

export class ModelMemoryService {
  private readonly store: MemoryStore;
  private readonly config: Required<ModelMemoryConfig>;
  private initialized = false;

  constructor(
    private readonly ctx: HostContext,
    config: ModelMemoryConfig = {},
    store?: MemoryStore,
  ) {
    this.config = {
      defaultFallbackEffort: config.defaultFallbackEffort ?? 'max',
      syncDefaultModel: config.syncDefaultModel ?? true,
      storagePath: config.storagePath ?? '',
      enabled: config.enabled ?? true,
    };
    this.store = store ?? new MemoryStore(this.config.storagePath || undefined);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await this.store.init();

    // 如果刚启动且当前 agentDefaultModel 存在，将其作为初始底底记忆
    if (this.ctx.agentDefaultModel) {
      try {
        const current = this.ctx.agentDefaultModel.currentSelection();
        if (current?.provider && current?.model) {
          const remembered = this.store.getPreference(current.provider, current.model);
          if (!remembered) {
            await this.store.remember({
              provider: current.provider,
              model: current.model,
              reasoningEffort: current.reasoningEffort,
            });
          }
        }
      } catch {
        // 容错
      }
    }
  }

  /**
   * 记录并持久化模型与思考强度选择
   */
  async remember(selection: ModelSelectionPayload): Promise<void> {
    if (!this.config.enabled) return;
    await this.store.remember(selection);
  }

  /**
   * 查询指定渠道/模型的偏好；若未指定 model，返回该渠道上次使用的 model 及思考强度
   */
  getPreference(provider: string, model?: string): ModelSelectionPayload | undefined {
    return this.store.getPreference(provider, model);
  }

  /**
   * 智能推断指定渠道应使用的思考强度及模型
   */
  async resolvePreference(provider?: string, requestedModel?: string): Promise<ModelSelectionPayload | undefined> {
    const pref = this.store.resolveSelection(provider, requestedModel, this.config.defaultFallbackEffort);
    if (!pref) return undefined;

    // 如果连接了 llm 元数据服务，做可用思考强度的校验与适配
    if (this.ctx.llm?.resolveModelInfo) {
      try {
        const info = await this.ctx.llm.resolveModelInfo(pref.provider, pref.model);
        if (info?.reasoning?.efforts && info.reasoning.efforts.length > 0) {
          const supported: string[] = info.reasoning.efforts.map((e: { id: string }) => String(e.id));
          // 如果用户曾选 max 且模型支持 max，保持 max；若不支持则降级为最高支持级别
          if (pref.reasoningEffort && !supported.includes(pref.reasoningEffort)) {
            if (supported.includes('max')) {
              pref.reasoningEffort = 'max';
            } else if (supported.includes('high')) {
              pref.reasoningEffort = 'high';
            } else {
              pref.reasoningEffort = info.reasoning.defaultEffort ? String(info.reasoning.defaultEffort) : supported[supported.length - 1];
            }
          }
        }
      } catch {
        // 模型信息解析失败时维持记忆值
      }
    }

    return pref;
  }

  /**
   * 开启或关闭跨会话记忆
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * 清除指定渠道下某个模型的档位记忆（用户显式清除档位时调用）
   */
  async clearEffort(provider: string, model: string): Promise<void> {
    if (!this.config.enabled) return;
    await this.store.clearEffort(provider, model);
  }

  /**
   * 运行时更新配置（settings 命名空间变更时由宿主回调）
   */
  updateConfig(patch: Partial<ModelMemoryConfig>): void {
    if (patch.enabled !== undefined) this.config.enabled = patch.enabled;
    if (patch.syncDefaultModel !== undefined) this.config.syncDefaultModel = patch.syncDefaultModel;
    if (patch.defaultFallbackEffort !== undefined) this.config.defaultFallbackEffort = patch.defaultFallbackEffort;
  }

  /** 只读配置视图 */
  getConfig(): Readonly<Required<ModelMemoryConfig>> {
    return this.config;
  }

  /**
   * 重置记忆
   */
  async reset(provider?: string): Promise<void> {
    await this.store.reset(provider);
  }

  /**
   * 状态视图
   */
  getStatus(): ModelMemoryStatusView {
    const state = this.store.getState();
    const currentActive = this.ctx.agentDefaultModel?.currentSelection();
    return {
      enabled: this.config.enabled,
      lastProvider: state.lastProvider,
      channels: state.channels,
      currentActive,
    };
  }
}
