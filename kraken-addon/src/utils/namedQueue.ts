import PQueue from 'p-queue';

export function createNamedQueue(concurrency: number = 200) {
  const pending = new Map<string, Promise<unknown>>();
  const queue = new PQueue({ concurrency });

  return {
    wrap<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const existing = pending.get(key);
      if (existing) {
        return existing as Promise<T>;
      }

      const promise = queue.add(async () => fn()) as Promise<T>;
      pending.set(key, promise);

      promise.finally(() => {
        pending.delete(key);
      });

      return promise;
    },
  };
}
