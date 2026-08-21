/**
 * dsh-model-memory — RPC 接口封装
 *
 * 修复记录（v0.1.4）：
 * - update-model-reasoning 不再凭空「记住」一个用户从未选择过的档位
 *   （旧逻辑在保存配置时强制把 max/末位档位写进记忆库，污染偏好数据）；
 * - 写入优先走宿主 settings 服务（带锁、注释保留、原子提交），
 *   宿主服务缺失时回退到文件直写。
 */
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import type { ModelMemoryService, HostContext } from './memory.ts';
import type { ModelSelectionPayload } from './types.ts';
import { DshSettingsManager, type UpdateModelReasoningPayload } from './settings.ts';

export const MEMORY_RPC_CHANNEL = '/model-memory';

export function installMemoryRpc(
  connection: HostConnectionHandle,
  service: ModelMemoryService,
  settingsManager: DshSettingsManager = new DshSettingsManager(),
  host?: HostContext,
): () => Promise<void> {
  return connection.rpc.handle(
    MEMORY_RPC_CHANNEL,
    async (endpoint: string, payload: unknown, signal: AbortSignal) => {
      try {
        if (endpoint === 'status') {
          return { ok: true, value: service.getStatus() };
        }

        if (endpoint === 'remember') {
          const selection = parseSelection(payload);
          await service.remember(selection);
          return { ok: true, value: service.getStatus() };
        }

        if (endpoint === 'get-preference') {
          const { provider, model } = parseQuery(payload);
          const pref = service.getPreference(provider, model);
          return { ok: true, value: pref ?? null };
        }

        if (endpoint === 'resolve') {
          const { provider, model } = parseQuery(payload);
          const resolved = await service.resolvePreference(provider, model);
          return { ok: true, value: resolved ?? null };
        }

        if (endpoint === 'forget-effort') {
          const { provider, model } = parseQuery(payload);
          if (!provider || !model) throw new Error('provider and model are required');
          await service.clearEffort(provider, model);
          return { ok: true, value: service.getStatus() };
        }

        if (endpoint === 'reset') {
          const provider = typeof payload === 'string' ? payload : (payload as Record<string, unknown>)?.provider as string | undefined;
          await service.reset(provider);
          return { ok: true, value: service.getStatus() };
        }

        if (endpoint === 'toggle-memory') {
          const enabled = typeof payload === 'boolean' ? payload : Boolean((payload as any)?.enabled);
          service.setEnabled(enabled);
          return { ok: true, value: service.getStatus() };
        }

        if (endpoint === 'list-providers') {
          const providers = await settingsManager.listCustomProviders();
          // 附带每个模型当前的记忆档位，客户端可零查询地做会话内即时恢复
          for (const p of providers) {
            for (const m of p.models) {
              const pref = service.getPreference(p.id, m.id);
              if (pref?.reasoningEffort) {
                m.rememberedEffort = pref.reasoningEffort;
              }
            }
          }
          return { ok: true, value: providers };
        }

        if (endpoint === 'update-model-reasoning') {
          const updatePayload = parseUpdateReasoningPayload(payload);
          // 优先走宿主 settings 服务：跨进程锁 + 注释保留 + 原子提交
          const hostWriter = host?.settings;
          const updated = hostWriter && typeof hostWriter.mutate === 'function'
            ? await settingsManager.updateModelReasoningViaHost(hostWriter, updatePayload)
            : await settingsManager.updateModelReasoning(updatePayload);
          // 注意：此处不再自动写入任何思考等级偏好——
          // 配置模型支持的档位集合 ≠ 用户选择了某个档位。
          return { ok: true, value: updated };
        }

        return {
          ok: false,
          error: {
            code: 'internal',
            message: `Unknown endpoint in /model-memory: ${endpoint}`,
            details: {},
          },
        };
      } catch (error) {
        if (signal.aborted) {
          return {
            ok: false,
            error: { code: 'cancelled', message: 'Request was cancelled', details: {} },
          };
        }
        return {
          ok: false,
          error: {
            code: 'internal',
            message: error instanceof Error ? error.message : String(error),
            details: {},
          },
        };
      }
    },
    { authority: 'loopback' },
  );
}

function parseSelection(payload: unknown): ModelSelectionPayload {
  if (payload === null || typeof payload !== 'object') {
    throw new Error('payload must be an object');
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.provider !== 'string' || !record.provider) {
    throw new Error('provider is required');
  }
  if (typeof record.model !== 'string' || !record.model) {
    throw new Error('model is required');
  }
  return {
    provider: record.provider,
    model: record.model,
    ...(typeof record.reasoningEffort === 'string' && record.reasoningEffort.length > 0 ? { reasoningEffort: record.reasoningEffort } : {}),
  };
}

function parseQuery(payload: unknown): { provider: string; model?: string } {
  if (typeof payload === 'string') {
    return { provider: payload };
  }
  if (payload !== null && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    return {
      provider: typeof record.provider === 'string' ? record.provider : '',
      model: typeof record.model === 'string' ? record.model : undefined,
    };
  }
  return { provider: '' };
}

function parseUpdateReasoningPayload(payload: unknown): UpdateModelReasoningPayload {
  if (payload === null || typeof payload !== 'object') {
    throw new Error('payload must be an object');
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.providerId !== 'string' || !record.providerId) {
    throw new Error('providerId is required');
  }
  if (typeof record.modelId !== 'string' || !record.modelId) {
    throw new Error('modelId is required');
  }
  return {
    providerId: record.providerId,
    modelId: record.modelId,
    supportsReasoningEffort: Boolean(record.supportsReasoningEffort),
    thinkingFormat: typeof record.thinkingFormat === 'string' ? record.thinkingFormat : 'openai',
    reasoningEfforts: (Array.isArray(record.reasoningEfforts) || (record.reasoningEfforts && typeof record.reasoningEfforts === 'object'))
      ? (record.reasoningEfforts as any)
      : ['low', 'medium', 'high', 'max'],
  };
}
