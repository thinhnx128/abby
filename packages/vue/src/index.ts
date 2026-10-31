import { AbbyEventType, HttpService } from "@tryabby/core";
import {
  type App,
  type ComputedRef,
  type InjectionKey,
  type Plugin,
  computed,
  getCurrentInstance,
  inject,
  onMounted,
  onUnmounted,
  provide,
  ref,
} from "vue";

export interface AbbyCoreClient<
  TConfig extends Record<string, any> = Record<string, any>,
  TFlag extends string = string,
  TTest extends string = string,
> {
  getTestVariant?: (testId: TTest) => string;
  getVariant?: (testId: TTest) => string;
  onAct?: (testId: TTest, selectedVariant?: string) => void;
  getConfig?: () => {
    projectId: string;
    apiUrl?: string;
    currentEnvironment?: string;
  };
  getFeatureFlag: (flagKey: TFlag) => boolean;
  getRemoteConfig: <K extends Extract<keyof TConfig, string>>(
    configKey: K
  ) => TConfig[K];
  subscribe?: (listener: (data?: any) => void) => () => void;
}

export const ABBY_INJECTION_KEY: InjectionKey<AbbyCoreClient<any, any, any>> =
  Symbol("AbbyVueClient");

function resolveTestVariant<
  TConfig extends Record<string, any>,
  TFlag extends string,
  TTest extends string,
>(client: AbbyCoreClient<TConfig, TFlag, TTest>, testId: TTest): string {
  if (typeof client.getTestVariant === "function") {
    return client.getTestVariant(testId) ?? "";
  }
  if (typeof client.getVariant === "function") {
    return client.getVariant(testId) ?? "";
  }
  throw new Error(
    "[@tryabby/vue] Provided Abby client must implement getTestVariant(testId) or getVariant(testId)."
  );
}

export function createAbbyPlugin<
  TConfig extends Record<string, any> = Record<string, any>,
  TFlag extends string = string,
  TTest extends string = string,
>(client: AbbyCoreClient<TConfig, TFlag, TTest>): Plugin {
  return {
    install(app: App) {
      app.provide(ABBY_INJECTION_KEY, client);
    },
  };
}

export function provideAbby<
  TConfig extends Record<string, any> = Record<string, any>,
  TFlag extends string = string,
  TTest extends string = string,
>(
  client: AbbyCoreClient<TConfig, TFlag, TTest>
): AbbyCoreClient<TConfig, TFlag, TTest> {
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
    throw new Error(
      "[@tryabby/vue] Abby client not found. Register via app.use(createAbbyPlugin(client)) or provideAbby(client)."
    );
  }
  return client as AbbyCoreClient<TConfig, TFlag, TTest>;
}

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
      if (typeof client.subscribe === "function") {
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
    if (!isMounted.value) {
      return "";
    }
    return resolveTestVariant(client, testId);
  });

  const onAct = () => {
    const currentVariant = variant.value;
    if (!currentVariant) return;
    if (typeof client.onAct === "function") {
      client.onAct(testId, currentVariant);
      return;
    }
    const cfg =
      typeof client.getConfig === "function" ? client.getConfig() : undefined;
    if (cfg?.projectId) {
      HttpService.sendData({
        url: cfg.apiUrl,
        type: AbbyEventType.ACT,
        data: {
          projectId: cfg.projectId,
          selectedVariant: currentVariant,
          testName: testId,
        },
      });
    }
  };

  return { variant, onAct };
}

export function useFeatureFlag<TFlag extends string = string>(
  flagKey: TFlag
): ComputedRef<boolean> {
  const client = useAbbyClient<Record<string, any>, TFlag, string>();
  const version = ref(0);

  let unsubscribe: (() => void) | undefined;
  if (getCurrentInstance()) {
    onMounted(() => {
      if (typeof client.subscribe === "function") {
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

export function useRemoteConfig<
  TConfig extends Record<string, any> = Record<string, any>,
  K extends Extract<keyof TConfig, string> = Extract<keyof TConfig, string>,
>(configKey: K): ComputedRef<TConfig[K]> {
  const client = useAbbyClient<TConfig, string, string>();
  const version = ref(0);

  let unsubscribe: (() => void) | undefined;
  if (getCurrentInstance()) {
    onMounted(() => {
      if (typeof client.subscribe === "function") {
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

export function createAbbyVue<
  TConfig extends Record<string, any> = Record<string, any>,
  TFlag extends string = string,
  TTest extends string = string,
>(client: AbbyCoreClient<TConfig, TFlag, TTest>) {
  return {
    plugin: createAbbyPlugin(client),
    provideAbby: () => provideAbby(client),
    useAbby: (testId: TTest) => useAbby<TTest>(testId),
    useFeatureFlag: (flagKey: TFlag) => useFeatureFlag<TFlag>(flagKey),
    useRemoteConfig: <K extends Extract<keyof TConfig, string>>(configKey: K) =>
      useRemoteConfig<TConfig, K>(configKey),
  };
}
