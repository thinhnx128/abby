// File: packages/vue/src/index.ts
// Target Issue: https://github.com/tryabby/abby/issues/68
// Author: Xuan Thinh (@thinhnx128) <thinhnx128@gmail.com>

import { ref, computed, inject, provide, onMounted, onUnmounted, type InjectionKey, type Ref, type ComputedRef } from 'vue';

export interface AbbyCoreClient<TConfig extends Record<string, any> = Record<string, any>> {
  getVariant: (testId: string) => string;
  onAct: (testId: string) => void;
  getFeatureFlag: (flagKey: string) => boolean;
  getRemoteConfig: <K extends keyof TConfig>(configKey: K) => TConfig[K];
  subscribe?: (listener: () => void) => () => void;
}

const ABBY_INJECTION_KEY: InjectionKey<AbbyCoreClient<any>> = Symbol('AbbyVueClient');

export function provideAbby<TConfig extends Record<string, any> = Record<string, any>>(
  client: AbbyCoreClient<TConfig>
): AbbyCoreClient<TConfig> {
  provide(ABBY_INJECTION_KEY, client);
  return client;
}

export function useAbbyClient<TConfig extends Record<string, any> = Record<string, any>>(): AbbyCoreClient<TConfig> {
  const client = inject(ABBY_INJECTION_KEY);
  if (!client) {
    throw new Error('[@tryabby/vue] Abby client not found. Please call provideAbby(client) in a parent component.');
  }
  return client;
}

/**
 * Returns the currently selected variant for a given A/B test along with the onAct trigger.
 */
export function useAbby(testId: string): {
  variant: ComputedRef<string>;
  onAct: () => void;
} {
  const client = useAbbyClient();
  const version = ref(0);

  let unsubscribe: (() => void) | undefined;
  onMounted(() => {
    if (typeof client.subscribe === 'function') {
      unsubscribe = client.subscribe(() => {
        version.value += 1;
      });
    }
  });
  onUnmounted(() => {
    unsubscribe?.();
  });

  const variant = computed(() => {
    void version.value;
    return client.getVariant(testId);
  });

  const onAct = () => {
    client.onAct(testId);
  };

  return { variant, onAct };
}

/**
 * Returns the reactive boolean state of the specified feature flag.
 */
export function useFeatureFlag(flagKey: string): ComputedRef<boolean> {
  const client = useAbbyClient();
  const version = ref(0);

  let unsubscribe: (() => void) | undefined;
  onMounted(() => {
    if (typeof client.subscribe === 'function') {
      unsubscribe = client.subscribe(() => {
        version.value += 1;
      });
    }
  });
  onUnmounted(() => {
    unsubscribe?.();
  });

  return computed(() => {
    void version.value;
    return Boolean(client.getFeatureFlag(flagKey));
  });
}

/**
 * Returns the reactive value of a remote configuration key.
 */
export function useRemoteConfig<TValue = unknown>(configKey: string): ComputedRef<TValue> {
  const client = useAbbyClient();
  const version = ref(0);

  let unsubscribe: (() => void) | undefined;
  onMounted(() => {
    if (typeof client.subscribe === 'function') {
      unsubscribe = client.subscribe(() => {
        version.value += 1;
      });
    }
  });
  onUnmounted(() => {
    unsubscribe?.();
  });

  return computed(() => {
    void version.value;
    return client.getRemoteConfig(configKey) as TValue;
  });
}
