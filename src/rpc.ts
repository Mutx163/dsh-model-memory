/**
 * dsh-model-memory — RPC 接口封装
 */
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import type { ModelMemoryService } from './memory.ts';
import type { ModelSelectionPayload } from './types.ts';
import { DshSettingsManager, type UpdateModelReasoningPayload } from './settings.ts';

export const MEMORY_RPC_CHANNEL = '/model-memory';

export function installMemoryRpc(
  connection: HostConnectionHandle,
  service: ModelMemoryService,
  settingsManager: DshSettingsManager = new DshSettingsManager(),
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
          return { ok: true, value: providers };
        }

        if (endpoint === 'update-model-reasoning') {
          const updatePayload = parseUpdateReasoningPayload(payload);
          const updated = await settingsManager.updateModelReasoning(updatePayload);
          // 同步自动记住偏好
          if (updatePayload.supportsReasoningEffort) {
            const efforts = Array.isArray(updatePayload.reasoningEfforts)
              ? updatePayload.reasoningEfforts
              : Object.keys(updatePayload.reasoningEfforts || {});
            const defaultEffort = efforts.includes('max') ? 'max' : (efforts[efforts.length - 1] || 'high');
            await service.remember({
              provider: updatePayload.providerId,
              model: updatePayload.modelId,
              reasoningEffort: defaultEffort,
            });
          }
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
