/**
 * dsh-model-memory — 持久化存储引擎
 *
 * 修复记录（v0.1.4）：
 * - 落盘失败不再静默：清理自己的临时文件并向上抛出，由调用方决定降级策略；
 * - init 时清扫历史版本遗留的 *.tmp 遗骸；
 * - 写入串行化（写链），避免并发 remember 交叉产生临时文件堆积。
 */
import { readFile, writeFile, mkdir, rename, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import type { ChannelPreference, ModelMemoryState, ModelSelectionPayload, ReasoningEffortLevel } from './types.ts';

const CURRENT_VERSION = 1;

export function defaultStoragePath(): string {
  return join(homedir(), '.dsh', 'model-memory.json');
}

/** 落盘失败错误：携带底层原因，便于上层记录日志 */
export class MemoryPersistError extends Error {
  constructor(public readonly cause: unknown) {
    super('dsh-model-memory: 偏好落盘失败: ' + String(cause));
    this.name = 'MemoryPersistError';
  }
}

export class MemoryStore {
  private readonly filePath: string;
  private state: ModelMemoryState = {
    version: CURRENT_VERSION,
    channels: {},
  };
  private initialized = false;
  /** 串行化所有落盘操作：后一次写入排队等前一次完成，绝不交叉执行 */
  private writeChain: Promise<void> = Promise.resolve();

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
      // 容错：解析失败保持初始状态（不覆盖磁盘上的文件，等下次成功写入时重建）
    }
    // 清扫历史版本崩溃/失败遗留的临时文件（best-effort，不阻塞启动）
    await this.sweepTempFiles().catch(() => {});
  }

  /** 清理本插件历史版本遗留的 model-memory.json.*.tmp 遗骸 */
  async sweepTempFiles(): Promise<void> {
    const dir = dirname(this.filePath);
    // readdir 返回的是文件名而非全路径，前缀必须用 basename 匹配
    const prefix = basename(this.filePath) + '.';
    const entries = await readdir(dir).catch(() => [] as string[]);
    const fossils = entries.filter((name) => name.startsWith(prefix) && name.endsWith('.tmp'));
    if (fossils.length === 0) return;
    await Promise.all(fossils.map((name) => rm(join(dir, name), { force: true }).catch(() => {})));
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
   * 原子化落盘持久化（写入串行化；失败时清理临时文件并抛出 MemoryPersistError）
   */
  private persist(): Promise<void> {
    const run = this.writeChain.then(() => this.doPersist());
    // 链上吞掉失败以免阻断后续写入，但把真实结果返回给本次调用方
    this.writeChain = run.then(() => undefined, () => undefined);
    return run;
  }

  private async doPersist(): Promise<void> {
    const tempPath = `${this.filePath}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    try {
      const dir = dirname(this.filePath);
      await mkdir(dir, { recursive: true });
      await writeFile(tempPath, JSON.stringify(this.state, null, 2), 'utf-8');
      await rename(tempPath, this.filePath);
    } catch (error) {
      // 失败时必须清掉自己的临时文件，绝不留遗骸
      await rm(tempPath, { force: true }).catch(() => {});
      throw new MemoryPersistError(error);
    }
  }
}
