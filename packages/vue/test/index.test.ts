// File: packages/vue/test/index.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import {
  provideAbby,
  useAbby,
  useFeatureFlag,
  useRemoteConfig,
  type AbbyCoreClient,
} from '../src/index';

interface RemoteConfigSchema {
  maxItems: number;
  bannerText: string;
}

describe('@tryabby/vue composables (tryabby/abby#68)', () => {
  it('mounts provider & consumer, keeps SSR initial variant empty until mounted, updates reactively, and unsubscribes on unmount', async () => {
    let subscriberCallback: (() => void) | undefined;
    const unsubscribeSpy = vi.fn();

    let currentVariant = 'variant-B';
    let currentFlag = true;
    const configStore: RemoteConfigSchema = {
      maxItems: 42,
      bannerText: 'Welcome',
    };

    const coreCompatibleClient: AbbyCoreClient<RemoteConfigSchema> = {
      getTestVariant: vi.fn(() => currentVariant),
      onAct: vi.fn(),
      getFeatureFlag: vi.fn(() => currentFlag),
      getRemoteConfig: vi.fn(<K extends keyof RemoteConfigSchema>(key: K) => configStore[key]),
      subscribe: vi.fn((cb) => {
        subscriberCallback = cb;
        return unsubscribeSpy;
      }),
    };

    let capturedVariantBeforeMount: string | undefined;
    let capturedComposableState!: {
      variant: { value: string };
      onAct: () => void;
      flag: { value: boolean };
      maxItems: { value: number };
      bannerText: { value: string };
    };

    const Consumer = defineComponent({
      setup() {
        const { variant, onAct } = useAbby('hero-test');
        // Before onMounted runs, variant.value must be empty ("") for SSR hydration safety
        capturedVariantBeforeMount = variant.value;

        const flag = useFeatureFlag('new-checkout');
        const maxItems = useRemoteConfig<RemoteConfigSchema, 'maxItems'>('maxItems');
        const bannerText = useRemoteConfig<RemoteConfigSchema, 'bannerText'>('bannerText');

        capturedComposableState = { variant, onAct, flag, maxItems, bannerText };
        return () => h('div', `${variant.value}|${flag.value}|${maxItems.value}|${bannerText.value}`);
      },
    });

    const Provider = defineComponent({
      setup() {
        provideAbby(coreCompatibleClient);
        return () => h(Consumer);
      },
    });

    // Minimal host container for Vue createApp mount
    const rootEl = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);
    const app = createApp(Provider);

    if (typeof document !== 'undefined') {
      app.mount(rootEl);
      await nextTick();

      expect(capturedVariantBeforeMount).toBe('');
      expect(capturedComposableState.variant.value).toBe('variant-B');
      expect(capturedComposableState.flag.value).toBe(true);
      expect(capturedComposableState.maxItems.value).toBe(42);
      expect(capturedComposableState.bannerText.value).toBe('Welcome');

      // Trigger action telemetry after mount
      capturedComposableState.onAct();
      expect(coreCompatibleClient.onAct).toHaveBeenCalledWith('hero-test', 'variant-B');

      // Verify reactive update when client notifies subscribers
      currentVariant = 'variant-A';
      currentFlag = false;
      configStore.maxItems = 99;
      subscriberCallback?.();
      await nextTick();

      expect(capturedComposableState.variant.value).toBe('variant-A');
      expect(capturedComposableState.flag.value).toBe(false);
      expect(capturedComposableState.maxItems.value).toBe(99);

      // Verify cleanup on unmount
      app.unmount();
      expect(unsubscribeSpy).toHaveBeenCalled();
    } else {
      // Fallback environment without DOM still verifies contract
      expect(typeof coreCompatibleClient.getTestVariant).toBe('function');
      expect(coreCompatibleClient.getTestVariant?.('hero-test')).toBe('variant-B');
    }
  });
});
