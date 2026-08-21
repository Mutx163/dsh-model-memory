import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from '../src/store.ts';

describe('MemoryStore', () => {
  let tempDir: string;
  let storeFile: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'dsh-mem-test-'));
    storeFile = join(tempDir, 'memory.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('initializes with clean state', async () => {
    const store = new MemoryStore(storeFile);
    await store.init();
    expect(store.getState().channels).toEqual({});
    expect(store.getState().lastProvider).toBeUndefined();
  });

  it('remembers model and max reasoning effort correctly', async () => {
    const store = new MemoryStore(storeFile);
    await store.init();

    await store.remember({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'max',
    });

    const pref = store.getPreference('deepseek-official');
    expect(pref).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'max',
    });
    expect(store.getState().lastProvider).toBe('deepseek-official');
  });

  it('persists preferences across new store instances', async () => {
    const store1 = new MemoryStore(storeFile);
    await store1.init();
    await store1.remember({
      provider: 'openai',
      model: 'gpt-5',
      reasoningEffort: 'max',
    });

    // 创建第二个实例读取相同文件
    const store2 = new MemoryStore(storeFile);
    await store2.init();
    const pref = store2.getPreference('openai', 'gpt-5');
    expect(pref).toEqual({
      provider: 'openai',
      model: 'gpt-5',
      reasoningEffort: 'max',
    });
    expect(store2.getState().lastProvider).toBe('openai');
  });

  it('isolates preferences between different channels (providers)', async () => {
    const store = new MemoryStore(storeFile);
    await store.init();

    // 渠道 1：选择 max 强度
    await store.remember({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'max',
    });

    // 渠道 2：选择 high 强度
    await store.remember({
      provider: 'openai',
      model: 'gpt-5',
      reasoningEffort: 'high',
    });

    // 验证各自独立保存，互不干扰
    expect(store.getPreference('deepseek-official')).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'max',
    });

    expect(store.getPreference('openai')).toEqual({
      provider: 'openai',
      model: 'gpt-5',
      reasoningEffort: 'high',
    });
  });

  it('resets memory for single channel or entirely', async () => {
    const store = new MemoryStore(storeFile);
    await store.init();

    await store.remember({ provider: 'p1', model: 'm1', reasoningEffort: 'max' });
    await store.remember({ provider: 'p2', model: 'm2', reasoningEffort: 'high' });

    await store.reset('p1');
    expect(store.getPreference('p1')).toBeUndefined();
    expect(store.getPreference('p2')).toBeDefined();

    await store.reset();
    expect(store.getPreference('p2')).toBeUndefined();
    expect(store.getState().channels).toEqual({});
  });
});
