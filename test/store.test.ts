import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore, MemoryPersistError } from '../src/store.ts';

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

  it('leaves no temp files behind on successful persist', async () => {
    const store = new MemoryStore(storeFile);
    await store.init();
    await store.remember({ provider: 'p1', model: 'm1', reasoningEffort: 'max' });
    const entries = await readdir(tempDir);
    expect(entries.filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('cleans up its temp file and throws MemoryPersistError when the directory is unwritable', async () => {
    // 用一个「文件」冒充目录，使 mkdir/rename 必然失败
    const blocker = join(tempDir, 'blocker');
    await writeFile(blocker, 'not a dir', 'utf-8');
    const store = new MemoryStore(join(blocker, 'memory.json'));
    await store.init(); // init 容错，不抛

    await expect(
      store.remember({ provider: 'p1', model: 'm1', reasoningEffort: 'max' }),
    ).rejects.toBeInstanceOf(MemoryPersistError);

    // 失败后不遗留 .tmp（在不可写的伪目录下根本创建不出来；这里验证 tempDir 干净）
    const entries = await readdir(tempDir);
    expect(entries.filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('sweeps legacy tmp fossils on init', async () => {
    const fossil = `${storeFile}.1787313049814-fossil.tmp`;
    await writeFile(fossil, '{"version":1}', 'utf-8');
    const store = new MemoryStore(storeFile);
    await store.init();
    const entries = await readdir(tempDir);
    expect(entries).not.toContain(fossil.split(/[\\/]/).pop());
  });

  it('serializes concurrent remembers without losing writes', async () => {
    const store = new MemoryStore(storeFile);
    await store.init();
    await Promise.all([
      store.remember({ provider: 'a', model: 'm1', reasoningEffort: 'low' }),
      store.remember({ provider: 'b', model: 'm2', reasoningEffort: 'high' }),
      store.remember({ provider: 'c', model: 'm3', reasoningEffort: 'max' }),
    ]);
    const state = JSON.parse(await readFileUtf8(storeFile));
    expect(Object.keys(state.channels).sort()).toEqual(['a', 'b', 'c']);
  });
});

async function readFileUtf8(path: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path, 'utf-8');
}
