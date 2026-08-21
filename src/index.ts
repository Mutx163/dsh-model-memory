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

  // 2. 核心记忆与自动回填：切换模型时自动提取历史思考强度并注入
  if (host.agentDefaultModel) {
    const originalSaveSelection = host.agentDefaultModel.saveSelection.bind(host.agentDefaultModel);

    host.agentDefaultModel.saveSelection = async (next) => {
      let targetSelection = next;

      if (service.isEnabled() && next?.provider && next?.model) {
        if (next.reasoningEffort) {
          // 用户显式切换了思考等级 -> 记录偏好
          void service.remember({
            provider: next.provider,
            model: next.model,
            reasoningEffort: next.reasoningEffort,
          }).catch(() => {});
        } else {
          // 用户点击切换了模型（未带思考等级）-> 从记忆库中自动提取并补全
          const remembered = service.getPreference(next.provider, next.model);
          if (remembered?.reasoningEffort) {
            targetSelection = {
              ...next,
              reasoningEffort: remembered.reasoningEffort,
            };
          }
        }
      }

      return originalSaveSelection(targetSelection);
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
