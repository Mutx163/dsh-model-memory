import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DshSettingsManager } from '../src/settings.ts';

describe('DshSettingsManager', () => {
  let tmpDir: string;
  let testSettingsPath: string;
  let manager: DshSettingsManager;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-settings-test-'));
    testSettingsPath = path.join(tmpDir, 'settings.yaml');
    manager = new DshSettingsManager(testSettingsPath);
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('should return empty list when settings.yaml does not exist', async () => {
    const providers = await manager.listCustomProviders();
    expect(providers).toEqual([]);
  });

  it('should parse existing custom providers and models', async () => {
    const initialYaml = `
llm-pi-ai:
  providers:
    my-proxy:
      displayName: My Proxy
      baseURL: https://api.example.com/v1
      models:
        - id: gpt-5.6-turbo
          name: GPT-5.6 Turbo
          compat:
            supportsReasoningEffort: true
            thinkingFormat: openai
          reasoningEfforts:
            low: low
            high: high
            max: max
        - id: claude-3-haiku
          name: Claude 3 Haiku
`;
    await fs.promises.writeFile(testSettingsPath, initialYaml, 'utf8');

    const providers = await manager.listCustomProviders();
    expect(providers.length).toBe(1);
    expect(providers[0].id).toBe('my-proxy');
    expect(providers[0].displayName).toBe('My Proxy');
    expect(providers[0].models.length).toBe(2);

    const model1 = providers[0].models[0];
    expect(model1.id).toBe('gpt-5.6-turbo');
    expect(model1.supportsReasoningEffort).toBe(true);
    expect(model1.thinkingFormat).toBe('openai');
    expect(model1.supportedEffortList).toEqual(['low', 'high', 'max']);

    const model2 = providers[0].models[1];
    expect(model2.id).toBe('claude-3-haiku');
    expect(model2.supportsReasoningEffort).toBe(false);
  });

  it('should update model reasoning effort and write back atomically', async () => {
    const initialYaml = `
llm-pi-ai:
  providers:
    my-proxy:
      displayName: My Proxy
      models:
        - id: custom-model
          name: Custom Model
`;
    await fs.promises.writeFile(testSettingsPath, initialYaml, 'utf8');

    const updated = await manager.updateModelReasoning({
      providerId: 'my-proxy',
      modelId: 'custom-model',
      supportsReasoningEffort: true,
      thinkingFormat: 'deepseek',
      reasoningEfforts: ['medium', 'high', 'max'],
    });

    expect(updated.supportsReasoningEffort).toBe(true);
    expect(updated.thinkingFormat).toBe('deepseek');
    expect(updated.supportedEffortList).toEqual(['medium', 'high', 'max']);

    // Re-read from disk to verify persistence
    const reloaded = await manager.listCustomProviders();
    const model = reloaded[0].models[0];
    expect(model.supportsReasoningEffort).toBe(true);
    expect(model.thinkingFormat).toBe('deepseek');
    expect(model.supportedEffortList).toEqual(['medium', 'high', 'max']);
  });

  it('should disable reasoning effort when requested', async () => {
    const initialYaml = `
llm-pi-ai:
  providers:
    my-proxy:
      models:
        - id: custom-model
          compat:
            supportsReasoningEffort: true
          reasoningEfforts:
            max: max
`;
    await fs.promises.writeFile(testSettingsPath, initialYaml, 'utf8');

    await manager.updateModelReasoning({
      providerId: 'my-proxy',
      modelId: 'custom-model',
      supportsReasoningEffort: false,
    });

    const reloaded = await manager.listCustomProviders();
    const model = reloaded[0].models[0];
    expect(model.supportsReasoningEffort).toBe(false);
    expect(model.reasoningEfforts).toEqual({});
  });
});
