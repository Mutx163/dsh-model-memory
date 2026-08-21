/**
 * dsh-model-memory — DSH 渠道与思考强度记忆插件（Host 侧）
 *
 * 修复记录（v0.1.5）：
 * - 通过 installSettingsSection 注册 dsh-model-memory 设置命名空间：
 *   这是客户端卡片挂上官方 settings.plugin.item 槽位的前提
 *   （槽位渲染 = Host 服务命名空间 ∩ 卡片声明的 key）；
 * - 配置变更经 onChange 实时生效，无需重启。
 *
 * 历史修复（v0.1.4）：
 * - saveSelection 包装不把「显式清除档位」误判为「需要回填旧记忆」；
 * - 记忆落盘失败记录告警；syncDefaultModel=false 真正生效。
 */
import type { Context } from '@deepseek-ai/cordis';
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
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
  const cfg = (config ?? {}) as ModelMemoryConfig;
  const logger = ctx.logger(name);

  const service = new ModelMemoryService(host, cfg);
  const settingsManager = new DshSettingsManager();

  // 0. 注册设置命名空间：取得设置页「插件 → 可配置」卡片的服务资格，
  //    并让 enabled / syncDefaultModel / defaultFallbackEffort 的变更实时生效
  let readLatest: () => ModelMemoryConfig = () => cfg;
  installSettingsSection(ctx, settingsNamespace(name), Config as never, cfg as never, {
    setSource: (source) => {
      readLatest = source as unknown as () => ModelMemoryConfig;
    },
    onChange: () => {
      try {
        const s = readLatest() ?? cfg;
        service.updateConfig({
          enabled: s.enabled !== false,
          syncDefaultModel: s.syncDefaultModel !== false,
          defaultFallbackEffort: s.defaultFallbackEffort ?? 'max',
        });
      } catch {
        // 容错：配置热更新失败不影响既有行为
      }
    },
  });

  // 1. 生命周期挂载：初始化存储与 RPC 通道
  ctx.effect(() => {
    let disposeRpc: (() => Promise<void>) | undefined;

    void service.init().then(() => {
      logger.info('dsh-model-memory: 渠道与思考强度记忆引擎已就绪');

      // 注册 RPC 通道 /model-memory
      if (host.connection?.rpc) {
        disposeRpc = installMemoryRpc(host.connection, service, settingsManager, host);
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
          // 用户显式选择了思考等级 -> 记录偏好（失败仅告警，不阻断切换）
          void service.remember({
            provider: next.provider,
            model: next.model,
            reasoningEffort: next.reasoningEffort,
          }).catch((err) => {
            logger.warn('dsh-model-memory: 偏好记录落盘失败: ' + String(err));
          });
        } else if (service.getConfig().syncDefaultModel !== false) {
          // 未携带思考等级：可能是「切模型」也可能是「清除档位」。
          // 仅当记忆中的偏好与本次提交的 provider/model 完全一致时才回填，
          // 避免用陈旧记忆覆盖用户刚做的选择。
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
