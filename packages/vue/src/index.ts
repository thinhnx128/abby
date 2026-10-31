// File: packages/vue/src/index.ts
// Target Issue: https://github.com/tryabby/abby/issues/68
// Author: Xuan Thinh (@thinhnx128) <thinhnx128@gmail.com>

import {
  ref,
  computed,
  inject,
  provide,
  onMounted,
  onUnmounted,
  getCurrentInstance,
  type InjectionKey,
  type ComputedRef,
} from 'vue';

export interface AbbyCoreClient<
  TConfig extends Record<string, any> = Record<string, any>,
  TFlag extends string = string,
  TTest extends string = string,
> {
  /** Core @tryabby/core method for selecting A/B test variants */
  getTestVariant?: (testId: TTest) => string;
  /** Optional alias for custom/lightweight clients */
  getVariant?: (testId: TTest) => string;
  /** Optional action callback for custom clients or @tryabby/core telemetry */
  onAct?: (testId: TTest, selectedVariant?: string) => void;
  getFeatureFlag: (flagKey: TFlag) => boolean;
  getRemoteConfig: <K extends Extract<keyof TConfig, string>>(configKey: K) => TConfig[K];
  subscribe?: (listener: (data?: any) => void) => () => void;
}

const ABBY_INJECTION_KEY: InjectionKey<AbbyCoreClient<any, any, any>> = Symbol('AbbyVueClient');

function resolveTestVariant<TConfig extends Record<string, any>, TFlag extends string, TTest extends string>(
  client: AbbyCoreClient<TConfig, TFlag, TTest>,
  testId: TTest
): string {
  if (typeof client.getTestVariant === 'function') {
    return client.getTestVariant(testId) ?? '';
  }
  if (typeof client.getVariant === 'function') {
    return client.getVariant(testId) ?? '';
  }
  throw new Error('[@tryabby/vue] Provided Abby client must implement getTestVariant(testId) or getVariant(testId).');
}

export function provideAbby<
  TConfig extends Record<string, any> = Record<string, any>,
  TFlag extends string = string,
  TTest extends string = string,
>(client: AbbyCoreClient<TConfig, TFlag, TTest>): AbbyCoreClient<TConfig, TFlag, TTest> {
  provide(ABBY_INJECTION_KEY, client);
  return client;
}

export function useAbbyClient<
  TConfig extends Record<string, any> = Record<string, any>,
  TFlag extends string = string,
  TTest extends string = string,
>(): AbbyCoreClient<TConfig, TFlag, TTest> {
  const client = inject(ABBY_INJECTION_KEY);
  if (!client) {
    throw new Error('[@tryabby/vue] Abby client not found. Please call provideAbby(client) in a parent component.');
  }
  return client as AbbyCoreClient<TConfig, TFlag, TTest>;
}

/**
 * Returns the currently selected variant for a given A/B test along with the onAct trigger.
 * Keeps initial variant empty ("") until mounted to prevent SSR/Nuxt hydration mismatches.
 */
export function useAbby<TTest extends string = string>(
  testId: TTest
): {
  variant: ComputedRef<string>;
  onAct: () => void;
} {
  const client = useAbbyClient<Record<string, any>, string, TTest>();
  const version = ref(0);
  const isMounted = ref(false);

  let unsubscribe: (() => void) | undefined;

  if (getCurrentInstance()) {
    onMounted(() => {
      isMounted.value = true;
      if (typeof client.subscribe === 'function') {
        unsubscribe = client.subscribe(() => {
          version.value += 1;
        });
      }
    });
    onUnmounted(() => {
      unsubscribe?.();
      unsubscribe = undefined;
    });
  }

  const variant = computed(() => {
    void version.value;
    // Render empty string before client mount to avoid SSR/hydration markup mismatch
    if (!isMounted.value) {
      return '';
    }
    return resolveTestVariant(client, testId);
  });

  const onAct = () => {
    const currentVariant = variant.value;
    if (!currentVariant) return;
    if (typeof client.onAct === 'function') {
      client.onAct(testId, currentVariant);
    }
  };

  return { variant, onAct };
}

/**
 * Returns the reactive boolean state of the specified feature flag.
 */
export function useFeatureFlag<TFlag extends string = string>(flagKey: TFlag): ComputedRef<boolean> {
  const client = useAbbyClient<Record<string, any>, TFlag, string>();
  const version = ref(0);

  let unsubscribe: (() => void) | undefined;
  if (getCurrentInstance()) {
    onMounted(() => {
      if (typeof client.subscribe === 'function') {
        unsubscribe = client.subscribe(() => {
          version.value += 1;
        });
      }
    });
    onUnmounted(() => {
      unsubscribe?.();
      unsubscribe = undefined;
    });
  }

  return computed(() => {
    void version.value;
    return Boolean(client.getFeatureFlag(flagKey));
  });
}

/**
 * Returns the reactive value of a remote configuration key with its type strictly derived from TConfig[K].
 */
export function useRemoteConfig<
  TConfig extends Record<string, any> = Record<string, any>,
  K extends Extract<keyof TConfig, string> = Extract<keyof TConfig, string>,
>(configKey: K): ComputedRef<TConfig[K]> {
  const client = useAbbyClient<TConfig, string, string>();
  const version = ref(0);

  let unsubscribe: (() => void) | undefined;
  if (getCurrentInstance()) {
    onMounted(() => {
      if (typeof client.subscribe === 'function') {
        unsubscribe = client.subscribe(() => {
          version.value += 1;
        });
      }
    });
    onUnmounted(() => {
      unsubscribe?.();
      unsubscribe = undefined;
    });
  }

  return computed(() => {
    void version.value;
    return client.getRemoteConfig(configKey);
  });
}
