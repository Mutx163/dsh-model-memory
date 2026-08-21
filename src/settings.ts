/**
 * dsh-model-memory — DSH settings.yaml 自定义 API 渠道与模型思考等级管理器
 *
 * 修复记录（v0.1.4）：
 * - 写入优先走宿主 settings 服务（mutate path-op）：由 dsh-settings-file 统一
 *   持有跨进程写锁、做注释保留的叶级 diff 与原子提交，不再与宿主抢跑；
 * - 文件直写仅作为宿主 settings 服务未挂载时的回退，且改为「读-改-锁-写」，
 *   不再整文档重排（保留原文件的键序与注释）。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';

/** 宿主 settings 服务的最小写入面（与 @deepseek-ai/dsh-settings SettingsProvider 对齐） */
export interface HostSettingsWriter {
  mutate(namespace: string, ops: { op: 'set' | 'unset'; path: string[]; value?: unknown }[]): Promise<void>;
}

export interface CustomModelReasoningConfig {
  id: string;
  name?: string;
  contextWindow?: number;
  supportsReasoningEffort: boolean;
  thinkingFormat: string;
  reasoningEfforts: Record<string, string>;
  supportedEffortList: string[];
  /** 该模型当前的记忆档位（由 RPC 层从记忆库注入；未记忆时缺省） */
  rememberedEffort?: string;
}

export interface CustomProviderInfo {
  id: string;
  displayName: string;
  baseURL?: string;
  api?: string;
  models: CustomModelReasoningConfig[];
}

export interface UpdateModelReasoningPayload {
  providerId: string;
  modelId: string;
  supportsReasoningEffort: boolean;
  thinkingFormat?: string;
  reasoningEfforts?: string[] | Record<string, string>;
}

const LLM_SECTION = 'llm-pi-ai';
const PROVIDERS_KEY = 'providers';

export class DshSettingsManager {
  private customSettingsPath?: string;

  constructor(customPath?: string) {
    this.customSettingsPath = customPath;
  }

  public getSettingsPath(): string {
    if (this.customSettingsPath) {
      return this.customSettingsPath;
    }
    const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
    return path.join(dshHome, 'settings.yaml');
  }

  /**
   * 通过宿主 settings 服务写入 llm-pi-ai.providers.<providerId>.models 中
   * 指定模型的 reasoning 配置。path-op 只触碰目标模型行，其余内容零扰动。
   */
  public async updateModelReasoningViaHost(
    host: HostSettingsWriter,
    payload: UpdateModelReasoningPayload,
  ): Promise<CustomModelReasoningConfig> {
    const { providerId, modelId, supportsReasoningEffort, thinkingFormat, reasoningEfforts } = payload;

    // 先读当前文档拿到该 provider 的现有 models 数组（保持其它行不动）
    const settings = await this.readSettings();
    const providersObj = settings[LLM_SECTION]?.[PROVIDERS_KEY];
    const providerData = providersObj && typeof providersObj === 'object' ? (providersObj as Record<string, any>)[providerId] : undefined;
    if (!providerData || typeof providerData !== 'object') {
      throw new Error(`Provider not found: ${providerId}`);
    }

    const rawModels = Array.isArray(providerData.models) ? providerData.models : [];
    const nextModels = rawModels.map((m: any) => ({ ...m }));
    let modelObj = nextModels.find((m: any) => m.id === modelId || m.name === modelId);
    if (!modelObj) {
      modelObj = { id: modelId, name: modelId };
      nextModels.push(modelObj);
    }

    const compat = (modelObj.compat && typeof modelObj.compat === 'object') ? { ...modelObj.compat } : {};
    compat.supportsReasoningEffort = supportsReasoningEffort;
    if (thinkingFormat) {
      compat.thinkingFormat = thinkingFormat;
    } else if (!compat.thinkingFormat) {
      compat.thinkingFormat = 'openai';
    }
    modelObj.compat = compat;

    let effortMap: Record<string, string> = {};
    if (supportsReasoningEffort) {
      if (Array.isArray(reasoningEfforts)) {
        for (const eff of reasoningEfforts) effortMap[eff] = eff;
      } else if (reasoningEfforts && typeof reasoningEfforts === 'object') {
        effortMap = { ...reasoningEfforts };
      } else {
        effortMap = { low: 'low', medium: 'medium', high: 'high', max: 'max' };
      }
      modelObj.reasoningEfforts = effortMap;
    } else {
      delete modelObj.reasoningEfforts;
    }

    const basePath = [LLM_SECTION, PROVIDERS_KEY, providerId, 'models'];
    const index = modelIndex(nextModels, modelObj.id);
    if (index < 0) throw new Error(`Provider not found after patch: ${providerId}`);

    await host.mutate('llm-pi-ai', [
      { op: 'set', path: [...basePath, String(index)], value: modelObj },
    ]);

    return {
      id: modelObj.id,
      name: modelObj.name || modelObj.id,
      contextWindow: typeof modelObj.contextWindow === 'number' ? modelObj.contextWindow : undefined,
      supportsReasoningEffort,
      thinkingFormat: compat.thinkingFormat,
      reasoningEfforts: effortMap,
      supportedEffortList: Object.keys(effortMap),
    };
  }

  public async readSettings(): Promise<Record<string, any>> {
    const filePath = this.getSettingsPath();
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const parsed = yamlLoad(content);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, any>;
      }
      return {};
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return {};
      }
      throw err;
    }
  }

  /**
   * 回退路径：直接写 settings.yaml。
   * 仅当宿主 settings 服务不可用时使用；带锁 + 原子替换，失败时清理临时文件。
   */
  public async writeSettings(settings: Record<string, any>): Promise<void> {
    const filePath = this.getSettingsPath();
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });

    const yamlStr = yamlDump(settings, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });

    const lockPath = filePath + '.lock';
    const tmpFile = `${filePath}.${Date.now()}.tmp`;
    const deadline = Date.now() + 2000;
    let delay = 20;
    // 简化的跨进程写锁：与 dsh-atomic-write 相同的 wx 语义
    for (;;) {
      try {
        await fs.promises.writeFile(lockPath, String(process.pid) + '\n', { flag: 'wx' });
        break;
      } catch (err: any) {
        if (err.code !== 'EEXIST' && err.code !== 'EPERM') throw err;
        if (Date.now() >= deadline) {
          await fs.promises.rm(tmpFile, { force: true }).catch(() => {});
          throw new Error('dsh-model-memory: settings.yaml 写锁等待超时（可能存在孤儿锁）');
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 200);
      }
    }
    try {
      await fs.promises.writeFile(tmpFile, yamlStr, 'utf8');
      await fs.promises.rename(tmpFile, filePath);
    } catch (error) {
      await fs.promises.rm(tmpFile, { force: true }).catch(() => {});
      throw error;
    } finally {
      await fs.promises.rm(lockPath, { force: true }).catch(() => {});
    }
  }

  public async listCustomProviders(): Promise<CustomProviderInfo[]> {
    const settings = await this.readSettings();
    const providersObj = settings[LLM_SECTION]?.[PROVIDERS_KEY];
    if (!providersObj || typeof providersObj !== 'object') {
      return [];
    }

    const result: CustomProviderInfo[] = [];

    for (const [providerId, providerData] of Object.entries<any>(providersObj)) {
      if (!providerData || typeof providerData !== 'object') continue;

      const rawModels = Array.isArray(providerData.models) ? providerData.models : [];
      const models: CustomModelReasoningConfig[] = rawModels.map((m: any) => {
        const id = String(m.id || '');
        const name = m.name ? String(m.name) : id;
        const compat = m.compat && typeof m.compat === 'object' ? m.compat : {};
        const supportsReasoningEffort = Boolean(compat.supportsReasoningEffort ?? (m.reasoningEfforts && Object.keys(m.reasoningEfforts).length > 0));
        const thinkingFormat = String(compat.thinkingFormat || 'openai');

        let reasoningEfforts: Record<string, string> = {};
        if (m.reasoningEfforts && typeof m.reasoningEfforts === 'object') {
          reasoningEfforts = { ...m.reasoningEfforts };
        } else if (supportsReasoningEffort) {
          reasoningEfforts = { low: 'low', medium: 'medium', high: 'high', max: 'max' };
        }

        const supportedEffortList = Object.keys(reasoningEfforts);

        return {
          id,
          name,
          contextWindow: typeof m.contextWindow === 'number' ? m.contextWindow : undefined,
          supportsReasoningEffort,
          thinkingFormat,
          reasoningEfforts,
          supportedEffortList,
        };
      });

      result.push({
        id: providerId,
        displayName: String(providerData.displayName || providerId),
        baseURL: providerData.baseURL ? String(providerData.baseURL) : undefined,
        api: providerData.api ? String(providerData.api) : undefined,
        models,
      });
    }

    return result;
  }

  /** 回退路径的更新实现（无宿主 settings 服务时） */
  public async updateModelReasoning(payload: UpdateModelReasoningPayload): Promise<CustomModelReasoningConfig> {
    const { providerId, modelId, supportsReasoningEffort, thinkingFormat, reasoningEfforts } = payload;
    const settings = await this.readSettings();

    if (!settings[LLM_SECTION]) {
      settings[LLM_SECTION] = {};
    }
    if (!settings[LLM_SECTION][PROVIDERS_KEY]) {
      settings[LLM_SECTION][PROVIDERS_KEY] = {};
    }
    if (!settings[LLM_SECTION][PROVIDERS_KEY][providerId]) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    const providerObj = settings[LLM_SECTION][PROVIDERS_KEY][providerId];
    if (!Array.isArray(providerObj.models)) {
      providerObj.models = [];
    }

    let modelObj = providerObj.models.find((m: any) => m.id === modelId || m.name === modelId);
    if (!modelObj) {
      modelObj = { id: modelId, name: modelId };
      providerObj.models.push(modelObj);
    }

    if (!modelObj.compat || typeof modelObj.compat !== 'object') {
      modelObj.compat = {};
    }

    modelObj.compat.supportsReasoningEffort = supportsReasoningEffort;
    if (thinkingFormat) {
      modelObj.compat.thinkingFormat = thinkingFormat;
    } else if (!modelObj.compat.thinkingFormat) {
      modelObj.compat.thinkingFormat = 'openai';
    }

    let effortMap: Record<string, string> = {};
    if (supportsReasoningEffort) {
      if (Array.isArray(reasoningEfforts)) {
        for (const eff of reasoningEfforts) {
          effortMap[eff] = eff;
        }
      } else if (reasoningEfforts && typeof reasoningEfforts === 'object') {
        effortMap = { ...reasoningEfforts };
      } else {
        effortMap = { low: 'low', medium: 'medium', high: 'high', max: 'max' };
      }
      modelObj.reasoningEfforts = effortMap;
    } else {
      delete modelObj.reasoningEfforts;
    }

    await this.writeSettings(settings);

    return {
      id: modelObj.id,
      name: modelObj.name || modelObj.id,
      contextWindow: modelObj.contextWindow,
      supportsReasoningEffort,
      thinkingFormat: modelObj.compat.thinkingFormat,
      reasoningEfforts: effortMap,
      supportedEffortList: Object.keys(effortMap),
    };
  }
}

function modelIndex(models: Array<{ id?: string; name?: string }>, id: string): number {
  return models.findIndex((m) => m.id === id || m.name === id);
}
