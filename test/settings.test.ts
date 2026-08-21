import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DshSettingsManager, type HostSettingsWriter } from '../src/settings.ts';

describe('DshSettingsManager', () => {
  let tmpDir: string;
  let testSettingsPath: string;
  let manager: DshSettingsManager;

  const baseSettings = {
    'agent-default-model': { provider: 'fzjh', model: 'deepseek-v4-flash' },
    'llm-pi-ai': {
      providers: {
        fzjh: {
          displayName: '负载均衡',
          apiKeyEnv: 'FZJH_API_KEY',
          api: 'openai-completions',
          baseURL: 'http://example.invalid/v1',
          models: [
            {
              id: 'gpt-5.6-sol',
              name: 'gpt-5.6-sol',
              reasoningEfforts: { low: 'low', medium: 'medium', high: 'high' },
              compat: { supportsReasoningEffort: true, thinkingFormat: 'openai' },
            },
          ],
        },
      },
    },
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-settings-test-'));
    testSettingsPath = path.join(tmpDir, 'settings.yaml');
    manager = new DshSettingsManager(testSettingsPath);
    // 带注释的 YAML，验证写入不破坏注释与键序
    fs.writeFileSync(
      testSettingsPath,
      '# 用户全局配置\n' +
        'agent-default-model:\n  provider: fzjh\n  model: deepseek-v4-flash\n' +
        'llm-pi-ai:\n  providers:\n    fzjh:\n      # 负载均衡渠道\n      displayName: 负载均衡\n' +
        '      models:\n        - id: gpt-5.6-sol\n          name: gpt-5.6-sol\n' +
        '          reasoningEfforts:\n            low: low\n            medium: medium\n            high: high\n' +
        '          compat:\n            supportsReasoningEffort: true\n            thinkingFormat: openai\n',
      'utf8',
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('updateModelReasoningViaHost (host settings.mutate path)', () => {
    it('issues a single set op against the exact model row and preserves everything else', async () => {
      const ops: any[] = [];
      const hostWriter: HostSettingsWriter = {
        async mutate(_ns, issued) {
          ops.push(...issued);
        },
      };

      const result = await manager.updateModelReasoningViaHost(hostWriter, {
        providerId: 'fzjh',
        modelId: 'gpt-5.6-sol',
        supportsReasoningEffort: true,
        thinkingFormat: 'openai',
        reasoningEfforts: ['low', 'high', 'max'],
      });

      expect(ops).toHaveLength(1);
      expect(ops[0].op).toBe('set');
      expect(ops[0].path).toEqual(['llm-pi-ai', 'providers', 'fzjh', 'models', '0']);
      expect(ops[0].value.reasoningEfforts).toEqual({ low: 'low', high: 'high', max: 'max' });
      expect(result.supportedEffortList).toEqual(['low', 'high', 'max']);
      // 磁盘文件未被回退路径触碰
      const raw = fs.readFileSync(testSettingsPath, 'utf8');
      expect(raw).toContain('# 用户全局配置');
    });

    it('clears reasoningEfforts when supportsReasoningEffort is false', async () => {
      const ops: any[] = [];
      const hostWriter: HostSettingsWriter = {
        async mutate(_ns, issued) {
          ops.push(...issued);
        },
      };
      await manager.updateModelReasoningViaHost(hostWriter, {
        providerId: 'fzjh',
        modelId: 'gpt-5.6-sol',
        supportsReasoningEffort: false,
      });
      expect(ops[0].value.compat.supportsReasoningEffort).toBe(false);
      expect(ops[0].value.reasoningEfforts).toBeUndefined();
    });

    it('rejects unknown providers without writing anything', async () => {
      const hostWriter: HostSettingsWriter = {
        async mutate() {
          throw new Error('must not be called');
        },
      };
      await expect(
        manager.updateModelReasoningViaHost(hostWriter, {
          providerId: 'nope',
          modelId: 'm',
          supportsReasoningEffort: true,
        }),
      ).rejects.toThrow(/Provider not found/);
    });
  });

  describe('fallback file writer', () => {
    it('writes through the locked atomic path and keeps other sections intact', async () => {
      const result = await manager.updateModelReasoning({
        providerId: 'fzjh',
        modelId: 'gpt-5.6-sol',
        supportsReasoningEffort: true,
        thinkingFormat: 'openai',
        reasoningEfforts: ['max'],
      });
      expect(result.supportedEffortList).toEqual(['max']);

      const parsed = await manager.readSettings();
      const model = parsed['llm-pi-ai'].providers.fzjh.models.find((m: any) => m.id === 'gpt-5.6-sol');
      expect(model.reasoningEfforts).toEqual({ max: 'max' });
      // 其它分节原样保留
      expect(parsed['agent-default-model']).toEqual(baseSettings['agent-default-model']);
      // 无锁无临时文件残留
      const entries = fs.readdirSync(tmpDir);
      expect(entries.filter((e) => e.endsWith('.lock') || e.endsWith('.tmp'))).toEqual([]);
    });
  });

  describe('listCustomProviders', () => {
    it('lists providers with normalized model configs', async () => {
      const providers = await manager.listCustomProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe('fzjh');
      expect(providers[0].models[0].supportedEffortList).toEqual(['low', 'medium', 'high']);
    });
  });
});
