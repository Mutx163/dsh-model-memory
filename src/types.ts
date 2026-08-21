/**
 * dsh-model-memory — 类型定义
 *
 * 为 DSH 跨会话提供分渠道、分模型的思考强度（reasoningEffort）与模型记忆。
 */

export type ReasoningEffortLevel = 'off' | 'low' | 'medium' | 'high' | 'max';

/** 单个渠道（Provider）的记忆偏好 */
export interface ChannelPreference {
  /** 该渠道最后选用的模型 ID */
  lastModel?: string;
  /** 该渠道下各模型配置的思考强度映射：modelId -> effort ('max', 'high', 'medium', etc.) */
  efforts: Record<string, string>;
  /** 上次更新时间戳（ISO 字符串） */
  updatedAt?: string;
}

/** 插件持久化的完整状态数据 */
export interface ModelMemoryState {
  /** 格式版本号 */
  version: number;
  /** 上次全局使用的渠道 ID */
  lastProvider?: string;
  /** 各渠道的偏好数据 */
  channels: Record<string, ChannelPreference>;
}

/** 模型与思考强度联合选择对象 */
export interface ModelSelectionPayload {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

/** 插件配置定义 */
export interface ModelMemoryConfig {
  /** 当渠道某模型支持思考但未曾记忆过时，默认优先采用的思考强度（默认 'max'） */
  defaultFallbackEffort?: ReasoningEffortLevel;
  /** 是否自动将记忆同步到 DSH 全局默认模型（agentDefaultModel） */
  syncDefaultModel?: boolean;
  /** 本地备份与持久化存储路径（缺省时存至用户主目录 ~/.dsh/model-memory.json） */
  storagePath?: string;
  /** 插件总开关 */
  enabled?: boolean;
}

/** RPC 状态返回视图 */
export interface ModelMemoryStatusView {
  enabled: boolean;
  lastProvider?: string;
  channels: Record<string, ChannelPreference>;
  currentActive?: ModelSelectionPayload;
}
