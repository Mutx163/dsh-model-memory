import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelMemoryService, type HostContext } from '../src/memory.ts';
import { MemoryStore } from '../src/store.ts';

describe('ModelMemoryService', () => {
  let tempDir: string;
  let storeFile: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'dsh-srv-test-'));
    storeFile = join(tempDir, 'memory.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('syncs remembered preference to agentDefaultModel automatically', async () => {
    let savedSelection: { provider: string; model: string; reasoningEffort?: string } | undefined;
    const fakeAgentDefaultModel = {
      currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-pro' }),
      saveSelection: async (next: { provider: string; model: string; reasoningEffort?: string }) => {
        savedSelection = next;
      },
    };

    const ctx = {
      logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
      agentDefaultModel: fakeAgentDefaultModel,
    } as unknown as HostContext;

    const store = new MemoryStore(storeFile);
    const service = new ModelMemoryService(ctx, {}, store);
    await service.init();

    await service.remember({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'max',
    });

    expect(savedSelection).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'max',
    });

    const pref = service.getPreference('deepseek-official');
    expect(pref?.reasoningEffort).toBe('max');
  });

  it('resolves model preferences with LLM metadata verification', async () => {
    const fakeLlm = {
      resolveModelInfo: async (provider: string, model: string) => ({
        provider,
        id: model,
        name: model,
        reasoning: {
          efforts: [{ id: 'off' }, { id: 'high' }, { id: 'max' }],
          defaultEffort: 'high',
        },
      }),
    };

    const ctx = {
      logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
      llm: fakeLlm,
    } as unknown as HostContext;

    const store = new MemoryStore(storeFile);
    const service = new ModelMemoryService(ctx, {}, store);
    await service.init();

    // 记录 max 偏好
    await service.remember({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'max',
    });

    // 求解偏好时，验证模型元数据支持 max 并保持 max
    const resolved = await service.resolvePreference('deepseek-official', 'deepseek-v4-pro');
    expect(resolved).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'max',
    });
  });
});
