/**
 * dsh-model-memory — 持久化存储引擎
 */
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { ChannelPreference, ModelMemoryState, ModelSelectionPayload, ReasoningEffortLevel } from './types.ts';

const CURRENT_VERSION = 1;

export function defaultStoragePath(): string {
  return join(homedir(), '.dsh', 'model-memory.json');
}

export class MemoryStore {
  private readonly filePath: string;
  private state: ModelMemoryState = {
    version: CURRENT_VERSION,
    channels: {},
  };
  private initialized = false;
  private savePromise: Promise<void> | null = null;

  constructor(customPath?: string) {
    this.filePath = customPath ?? defaultStoragePath();
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      if (existsSync(this.filePath)) {
        const raw = await readFile(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<ModelMemoryState>;
        if (parsed && typeof parsed === 'object') {
          this.state = {
            version: CURRENT_VERSION,
            lastProvider: typeof parsed.lastProvider === 'string' ? parsed.lastProvider : undefined,
            channels: (parsed.channels && typeof parsed.channels === 'object') ? parsed.channels : {},
          };
        }
      }
    } catch {
      // 容错：解析失败保持初始状态
    }
  }

  getState(): Readonly<ModelMemoryState> {
    return this.state;
  }

  /**
   * 记录用户的渠道、模型及思考强度选择
   */
  async remember(selection: ModelSelectionPayload): Promise<void> {
    const { provider, model, reasoningEffort } = selection;
    if (!provider || !model) return;

    let channel = this.state.channels[provider];
    if (!channel) {
      channel = {
        efforts: {},
      };
      this.state.channels[provider] = channel;
    }

    channel.lastModel = model;
    channel.updatedAt = new Date().toISOString();
    if (reasoningEffort !== undefined && reasoningEffort !== '') {
      channel.efforts[model] = reasoningEffort;
    }
    this.state.lastProvider = provider;

    await this.persist();
  }

  /**
   * 获取指定渠道与模型的偏好
   */
  getPreference(provider: string, model?: string): ModelSelectionPayload | undefined {
    const channel = this.state.channels[provider];
    if (!channel) return undefined;

    const targetModel = model ?? channel.lastModel;
    if (!targetModel) return undefined;

    const effort = channel.efforts[targetModel];
    return {
      provider,
      model: targetModel,
      ...(effort ? { reasoningEffort: effort } : {}),
    };
  }

  /**
   * 综合求解当前最贴合用户历史偏好的模型选择
   */
  resolveSelection(preferredProvider?: string, preferredModel?: string, fallbackEffort: ReasoningEffortLevel = 'max'): ModelSelectionPayload | undefined {
    const provider = preferredProvider ?? this.state.lastProvider;
    if (!provider) return undefined;

    const channel = this.state.channels[provider];
    const model = preferredModel ?? channel?.lastModel;
    if (!model) return undefined;

    const rememberedEffort = channel?.efforts[model];
    return {
      provider,
      model,
      reasoningEffort: rememberedEffort ?? fallbackEffort,
    };
  }

  /**
   * 重置记忆（可重置单个渠道或全部重置）
   */
  async reset(provider?: string): Promise<void> {
    if (provider) {
      delete this.state.channels[provider];
      if (this.state.lastProvider === provider) {
        this.state.lastProvider = Object.keys(this.state.channels)[0];
      }
    } else {
      this.state = {
        version: CURRENT_VERSION,
        channels: {},
      };
    }
    await this.persist();
  }

  /**
   * 原子化落盘持久化
   */
  private async persist(): Promise<void> {
    if (this.savePromise) {
      await this.savePromise;
    }
    this.savePromise = this.doPersist();
    try {
      await this.savePromise;
    } finally {
      this.savePromise = null;
    }
  }

  private async doPersist(): Promise<void> {
    try {
      const dir = dirname(this.filePath);
      await mkdir(dir, { recursive: true });
      const tempPath = `${this.filePath}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
      await writeFile(tempPath, JSON.stringify(this.state, null, 2), 'utf-8');
      await rename(tempPath, this.filePath);
    } catch {
      // 忽略文件写入异常，避免阻断运行
    }
  }
}
