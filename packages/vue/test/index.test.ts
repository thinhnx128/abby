// @vitest-environment jsdom
import { AbbyEventType, HttpService } from "@tryabby/core";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  type ComputedRef,
  createApp,
  defineComponent,
  h,
  nextTick,
} from "vue";
import {
  type AbbyCoreClient,
  createAbbyPlugin,
  provideAbby,
  useAbby,
  useFeatureFlag,
  useRemoteConfig,
} from "../src/index";

interface RemoteConfigSchema {
  maxItems: number;
  bannerText: string;
}

describe("@tryabby/vue composables (tryabby/abby#68)", () => {
  it("mounts provider & consumer, keeps SSR initial variant empty until mounted, updates reactively, and unsubscribes on unmount", async () => {
    const subscribers = new Set<() => void>();
    const unsubscribeSpy = vi.fn();

    let currentVariant = "variant-B";
    let currentFlag = true;
    const configStore: RemoteConfigSchema = {
      maxItems: 42,
      bannerText: "Welcome",
    };

    const coreCompatibleClient: AbbyCoreClient<RemoteConfigSchema> = {
      getTestVariant: vi.fn(() => currentVariant),
      onAct: vi.fn(),
      getFeatureFlag: vi.fn(() => currentFlag),
      getRemoteConfig: vi.fn(
        <K extends keyof RemoteConfigSchema>(key: K) => configStore[key]
      ),
      subscribe: vi.fn((cb: () => void) => {
        subscribers.add(cb);
        return () => {
          subscribers.delete(cb);
          unsubscribeSpy();
        };
      }),
    };

    let capturedVariantBeforeMount: string | undefined;
    let capturedComposableState!: {
      variant: ComputedRef<string>;
      onAct: () => void;
      flag: ComputedRef<boolean>;
      maxItems: ComputedRef<number>;
      bannerText: ComputedRef<string>;
    };

    const Consumer = defineComponent({
      setup() {
        const { variant, onAct } = useAbby("hero-test");
        capturedVariantBeforeMount = variant.value;

        const flag = useFeatureFlag("new-checkout");
        const maxItems = useRemoteConfig<RemoteConfigSchema, "maxItems">(
          "maxItems"
        );
        const bannerText = useRemoteConfig<RemoteConfigSchema, "bannerText">(
          "bannerText"
        );

        expectTypeOf(maxItems).toEqualTypeOf<ComputedRef<number>>();
        expectTypeOf(bannerText).toEqualTypeOf<ComputedRef<string>>();

        capturedComposableState = {
          variant,
          onAct,
          flag,
          maxItems,
          bannerText,
        };
        return () =>
          h(
            "div",
            `${variant.value}|${flag.value}|${maxItems.value}|${bannerText.value}`
          );
      },
    });

    const Provider = defineComponent({
      setup() {
        provideAbby(coreCompatibleClient);
        return () => h(Consumer);
      },
    });

    const rootEl = document.createElement("div");
    const app = createApp(Provider);
    app.mount(rootEl);
    await nextTick();

    expect(capturedVariantBeforeMount).toBe("");
    expect(capturedComposableState.variant.value).toBe("variant-B");
    expect(capturedComposableState.flag.value).toBe(true);
    expect(capturedComposableState.maxItems.value).toBe(42);
    expect(capturedComposableState.bannerText.value).toBe("Welcome");

    capturedComposableState.onAct();
    expect(coreCompatibleClient.onAct).toHaveBeenCalledWith(
      "hero-test",
      "variant-B"
    );

    currentVariant = "variant-A";
    currentFlag = false;
    configStore.maxItems = 99;
    for (const notify of subscribers) {
      notify();
    }
    await nextTick();

    expect(capturedComposableState.variant.value).toBe("variant-A");
    expect(capturedComposableState.flag.value).toBe(false);
    expect(capturedComposableState.maxItems.value).toBe(99);

    app.unmount();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(4);
    expect(subscribers.size).toBe(0);
  });

  it("registers via app.use(createAbbyPlugin(client)) and reports ACT events via HttpService when getConfig is present", async () => {
    const sendDataSpy = vi
      .spyOn(HttpService, "sendData")
      .mockImplementation(() => Promise.resolve());

    const coreInstanceLike: AbbyCoreClient<RemoteConfigSchema> = {
      getTestVariant: vi.fn(() => "variant-C"),
      getConfig: () => ({
        projectId: "proj_123",
        apiUrl: "https://api.tryabby.com",
      }),
      getFeatureFlag: vi.fn(() => true),
      getRemoteConfig: vi.fn(
        <K extends keyof RemoteConfigSchema>(key: K) =>
          ({ maxItems: 10, bannerText: "Hello" })[key]
      ),
    };

    let triggerAct!: () => void;
    let resolvedVariant!: ComputedRef<string>;

    const AppConsumer = defineComponent({
      setup() {
        const { variant, onAct } = useAbby("pricing-test");
        resolvedVariant = variant;
        triggerAct = onAct;
        return () => h("span", variant.value);
      },
    });

    const host = document.createElement("div");
    const app = createApp(AppConsumer);
    app.use(createAbbyPlugin(coreInstanceLike));
    app.mount(host);
    await nextTick();

    expect(resolvedVariant.value).toBe("variant-C");
    triggerAct();
    expect(sendDataSpy).toHaveBeenCalledWith({
      url: "https://api.tryabby.com",
      type: AbbyEventType.ACT,
      data: {
        projectId: "proj_123",
        selectedVariant: "variant-C",
        testName: "pricing-test",
      },
    });

    app.unmount();
    sendDataSpy.mockRestore();
  });
});
