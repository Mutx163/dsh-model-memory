/**
 * dsh-model-memory — DSH settings.yaml 自定义 API 渠道与模型思考等级管理器
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';

export interface CustomModelReasoningConfig {
  id: string;
  name?: string;
  contextWindow?: number;
  supportsReasoningEffort: boolean;
  thinkingFormat: string;
  reasoningEfforts: Record<string, string>;
  supportedEffortList: string[];
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

  public async writeSettings(settings: Record<string, any>): Promise<void> {
    const filePath = this.getSettingsPath();
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });

    const yamlStr = yamlDump(settings, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });

    const tmpFile = `${filePath}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmpFile, yamlStr, 'utf8');
    await fs.promises.rename(tmpFile, filePath);
  }

  public async listCustomProviders(): Promise<CustomProviderInfo[]> {
    const settings = await this.readSettings();
    const providersObj = settings['llm-pi-ai']?.providers;
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

  public async updateModelReasoning(payload: UpdateModelReasoningPayload): Promise<CustomModelReasoningConfig> {
    const { providerId, modelId, supportsReasoningEffort, thinkingFormat, reasoningEfforts } = payload;
    const settings = await this.readSettings();

    if (!settings['llm-pi-ai']) {
      settings['llm-pi-ai'] = {};
    }
    if (!settings['llm-pi-ai'].providers) {
      settings['llm-pi-ai'].providers = {};
    }
    if (!settings['llm-pi-ai'].providers[providerId]) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    const providerObj = settings['llm-pi-ai'].providers[providerId];
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
