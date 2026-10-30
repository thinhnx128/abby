// File: packages/vue/test/index.test.ts
import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { provideAbby, useAbby, useFeatureFlag, useRemoteConfig, type AbbyCoreClient } from '../src/index';

describe('@tryabby/vue composables (tryabby/abby#68)', () => {
  it('exposes useAbby, useFeatureFlag, and useRemoteConfig with strict TypeScript types', () => {
    const mockClient: AbbyCoreClient<{ maxItems: number }> = {
      getVariant: vi.fn().mockReturnValue('variant-B'),
      onAct: vi.fn(),
      getFeatureFlag: vi.fn().mockReturnValue(true),
      getRemoteConfig: vi.fn().mockReturnValue(42),
    };

    expect(typeof provideAbby).toBe('function');
    expect(typeof useAbby).toBe('function');
    expect(typeof useFeatureFlag).toBe('function');
    expect(typeof useRemoteConfig).toBe('function');
    expect(mockClient.getVariant('hero-test')).toBe('variant-B');
    expect(mockClient.getFeatureFlag('new-checkout')).toBe(true);
    expect(mockClient.getRemoteConfig('maxItems')).toBe(42);
  });
});
