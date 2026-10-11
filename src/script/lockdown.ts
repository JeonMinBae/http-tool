/** Members user code could use to talk to the host (or hijack the worker's inbox) once it reaches the global. */
const MESSAGING = ["postMessage", "onmessage", "onmessageerror"];

export interface LockedScope<Out> {
  /** The worker's original postMessage, usable only through this closure. */
  post(message: Out): void;
}

/**
 * Hardens a worker global before user code runs: captures postMessage and the message listener in
 * closures, removes the messaging members from the global and its prototypes, then freezes the global.
 * User code that reaches the global (e.g. via `Function("return this")()`) can no longer forge host messages.
 */
export function lockdownScope<Out, In>(scope: object, onMessage: (data: In) => void): LockedScope<Out> {
  const target = scope as { postMessage(m: unknown): void; addEventListener(type: string, fn: (e: MessageEvent) => void): void };
  const apply = Reflect.apply;
  const rawPost = target.postMessage;
  target.addEventListener("message", (e: MessageEvent) => onMessage(e.data as In));

  for (let obj: object | null = scope; obj && obj !== Object.prototype; obj = Object.getPrototypeOf(obj)) {
    for (const name of MESSAGING) {
      if (!Object.hasOwn(obj, name)) continue;
      try {
        delete (obj as Record<string, unknown>)[name];
      } catch {
        /* non-configurable; shadowed on the global below */
      }
    }
  }
  for (const name of MESSAGING) {
    try {
      Object.defineProperty(scope, name, { value: undefined, configurable: false, writable: false });
    } catch {
      /* already locked */
    }
  }
  try {
    Object.freeze(scope);
  } catch {
    /* engine refuses to freeze the global; messaging members are already gone */
  }

  return { post: (message: Out) => void apply(rawPost, scope, [message]) };
}
