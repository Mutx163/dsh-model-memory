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

  it('remembers preference passively without recursive loop', async () => {
    const fakeAgentDefaultModel = {
      currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-pro' }),
      saveSelection: async () => {},
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

    const pref = service.getPreference('deepseek-official');
    expect(pref?.reasoningEffort).toBe('max');
    expect(pref?.model).toBe('deepseek-v4-pro');
  });

  it('resolves model preferences with LLM metadata verification', async () => {
    const fakeLlm = {
      resolveModelInfo: async (provider: string, model: string) => ({
        provider,
        id: model,
        name: model,
        reasoning: {
          efforts: [{ id: 'low' }, { id: 'high' }],
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

    await service.remember({
      provider: 'custom-api',
      model: 'custom-gpt',
      reasoningEffort: 'max', // max 不在 low/high 中，预期降级为 high
    });

    const resolved = await service.resolvePreference('custom-api', 'custom-gpt');
    expect(resolved?.reasoningEffort).toBe('high');
  });
});
