import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelMemoryService, type HostContext } from '../src/memory.ts';
import { MemoryStore } from '../src/store.ts';

describe('ModelMemoryService', () => {
  let tempDir: string;
  let storeFile: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'dsh-mem-test-'));
    storeFile = join(tempDir, 'memory.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeCtx(llm?: unknown): HostContext {
    return {
      logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
      llm,
    } as unknown as HostContext;
  }

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

    const store = new MemoryStore(storeFile);
    const service = new ModelMemoryService(makeCtx(fakeLlm), {}, store);
    await service.init();

    await service.remember({
      provider: 'custom-api',
      model: 'custom-gpt',
      reasoningEffort: 'max', // max 不在 low/high 中，预期降级为 high
    });

    const resolved = await service.resolvePreference('custom-api', 'custom-gpt');
    expect(resolved?.reasoningEffort).toBe('high');
  });

  it('propagates persist failures instead of silently dropping them', async () => {
    // 指向一个不可写路径（用文件冒充目录）
    const blocker = join(tempDir, 'blocker');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(blocker, 'not a dir', 'utf-8');

    const store = new MemoryStore(join(blocker, 'memory.json'));
    const service = new ModelMemoryService(makeCtx(), {}, store);
    await service.init();

    await expect(
      service.remember({ provider: 'p', model: 'm', reasoningEffort: 'max' }),
    ).rejects.toThrow(/落盘失败/);
  });
});
