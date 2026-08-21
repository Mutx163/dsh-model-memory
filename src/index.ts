/**
 * dsh-model-memory — DSH 渠道与思考强度记忆插件（Host 侧）
 *
 * @module dsh-model-memory
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { ModelMemoryService, type HostContext } from './memory.ts';
import { installMemoryRpc } from './rpc.ts';
import { DshSettingsManager } from './settings.ts';
import type { ModelMemoryConfig } from './types.ts';

export const name = 'dsh-model-memory';

/** 声明宿主依赖服务 */
export const inject = ['connection', 'llm', 'agentDefaultModel'] as const;

/** 插件配置 Schema */
export const Config = z.object({
  defaultFallbackEffort: z.union(['off', 'low', 'medium', 'high', 'max']).default('max'),
  syncDefaultModel: z.boolean().default(true),
  storagePath: z.string().default(''),
  enabled: z.boolean().default(true),
});

export function apply(ctx: Context, config: unknown): void {
  const host = ctx as HostContext;
  const cfg = config as ModelMemoryConfig;
  const logger = ctx.logger(name);

  const service = new ModelMemoryService(host, cfg);
  const settingsManager = new DshSettingsManager();

  // 1. 生命周期挂载：初始化存储与 RPC 通道
  ctx.effect(() => {
    let disposeRpc: (() => Promise<void>) | undefined;

    void service.init().then(() => {
      logger.info('dsh-model-memory: 渠道与思考强度记忆引擎已就绪');

      // 注册 RPC 通道 /model-memory
      if (host.connection?.rpc) {
        disposeRpc = installMemoryRpc(host.connection, service, settingsManager);
      }
    }).catch((err) => {
      logger.error('dsh-model-memory 初始化失败: ' + String(err));
    });

    return () => {
      void disposeRpc?.();
    };
  }, 'dsh-model-memory: lifecycle');

  // 2. 包装 agentDefaultModel.saveSelection 确保每次全局或会话模型变更都能无感记忆
  if (host.agentDefaultModel) {
    const originalSaveSelection = host.agentDefaultModel.saveSelection.bind(host.agentDefaultModel);

    host.agentDefaultModel.saveSelection = async (next) => {
      // 记录到多渠道记忆表
      try {
        await service.remember({
          provider: next.provider,
          model: next.model,
          reasoningEffort: next.reasoningEffort,
        });
      } catch (err) {
        logger.warn('记忆模型偏好失败: ' + String(err));
      }

      // 如果传入的 next 缺少 reasoningEffort，尝试从记忆库中补全
      let effectiveNext = next;
      if (!next.reasoningEffort) {
        const remembered = service.getPreference(next.provider, next.model);
        if (remembered?.reasoningEffort) {
          effectiveNext = {
            ...next,
            reasoningEffort: remembered.reasoningEffort,
          };
        }
      }

      return originalSaveSelection(effectiveNext);
    };

    ctx.effect(() => () => {
      if (host.agentDefaultModel) {
        host.agentDefaultModel.saveSelection = originalSaveSelection;
      }
    }, 'dsh-model-memory: wrap agentDefaultModel');
  }
}

export { ModelMemoryService } from './memory.ts';
export { MemoryStore } from './store.ts';
export { DshSettingsManager } from './settings.ts';
export * from './types.ts';
