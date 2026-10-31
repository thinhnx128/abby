export type InjectionKey<T> = symbol & { __type?: T };

export interface Ref<T = any> {
  value: T;
}

export interface ComputedRef<T = any> {
  readonly value: T;
}

export interface App {
  provide<T>(key: InjectionKey<T> | string | symbol, value: T): this;
  use<Options extends unknown[]>(
    plugin: Plugin<Options>,
    ...options: Options
  ): this;
  mount(rootContainer: Element | string): unknown;
  unmount(): void;
}

export type Plugin<Options extends unknown[] = any[]> =
  | {
      install: (app: App, ...options: Options) => any;
    }
  | ((app: App, ...options: Options) => any);

interface ComponentInternalInstance {
  provides: Map<unknown, unknown>;
  mountedHooks: Array<() => void>;
  unmountedHooks: Array<() => void>;
}

let currentInstance: ComponentInternalInstance | null = null;

export function getCurrentInstance(): ComponentInternalInstance | null {
  return currentInstance;
}

export function ref<T>(initialValue: T): Ref<T> {
  let internalValue = initialValue;
  return {
    get value() {
      return internalValue;
    },
    set value(nextValue: T) {
      internalValue = nextValue;
    },
  };
}

export function computed<T>(getter: () => T): ComputedRef<T> {
  return {
    get value() {
      return getter();
    },
  };
}

export function provide<T>(
  key: InjectionKey<T> | string | symbol,
  value: T
): void {
  if (currentInstance) {
    currentInstance.provides.set(key, value);
  }
}

export function inject<T>(
  key: InjectionKey<T> | string | symbol,
  defaultValue?: T
): T | undefined {
  if (currentInstance && currentInstance.provides.has(key)) {
    return currentInstance.provides.get(key) as T;
  }
  return defaultValue;
}

export function onMounted(hook: () => void): void {
  if (currentInstance) {
    currentInstance.mountedHooks.push(hook);
  }
}

export function onUnmounted(hook: () => void): void {
  if (currentInstance) {
    currentInstance.unmountedHooks.push(hook);
  }
}

export function defineComponent<T extends Record<string, any>>(options: T): T {
  return options;
}

export function h(
  type: any,
  propsOrChildren?: any,
  children?: any
): { type: any; propsOrChildren?: any; children?: any } {
  return { type, propsOrChildren, children };
}

export function nextTick(fn?: () => void): Promise<void> {
  return Promise.resolve().then(() => {
    fn?.();
  });
}

export function createApp(rootComponent: any): App {
  const appProvides = new Map<unknown, unknown>();
  const instances: ComponentInternalInstance[] = [];
  let mountedContainer: Element | null = null;

  function renderVNode(
    vnode: any,
    parentProvides: Map<unknown, unknown>
  ): string {
    if (vnode == null) {
      return "";
    }
    if (typeof vnode === "string" || typeof vnode === "number") {
      return String(vnode);
    }
    if (typeof vnode.type === "string") {
      const content =
        vnode.children !== undefined ? vnode.children : vnode.propsOrChildren;
      return renderVNode(content, parentProvides);
    }
    if (vnode.type && typeof vnode.type.setup === "function") {
      const instance: ComponentInternalInstance = {
        provides: new Map(parentProvides),
        mountedHooks: [],
        unmountedHooks: [],
      };
      instances.push(instance);
      const prev = currentInstance;
      currentInstance = instance;
      let renderResult: any;
      try {
        renderResult = vnode.type.setup({});
      } finally {
        currentInstance = prev;
      }
      const subTree =
        typeof renderResult === "function" ? renderResult() : renderResult;
      return renderVNode(subTree, instance.provides);
    }
    return "";
  }

  const app: App = {
    provide(key, value) {
      appProvides.set(key, value);
      return app;
    },
    use(plugin, ...options) {
      if (plugin && typeof (plugin as any).install === "function") {
        (plugin as any).install(app, ...options);
      } else if (typeof plugin === "function") {
        plugin(app, ...options);
      }
      return app;
    },
    mount(rootContainer) {
      const html = renderVNode({ type: rootComponent }, appProvides);
      if (typeof rootContainer === "object" && rootContainer !== null) {
        mountedContainer = rootContainer;
        mountedContainer.textContent = html;
      }
      for (const inst of instances) {
        for (const hook of inst.mountedHooks) {
          hook();
        }
      }
      return {};
    },
    unmount() {
      for (const inst of instances) {
        for (const hook of inst.unmountedHooks) {
          hook();
        }
      }
      instances.length = 0;
      if (mountedContainer) {
        mountedContainer.textContent = "";
        mountedContainer = null;
      }
    },
  };

  return app;
}
