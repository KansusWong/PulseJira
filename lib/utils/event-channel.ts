/**
 * EventChannel — async iterable bridge for producer/consumer patterns.
 *
 * Allows a background producer (e.g. architect.run()) to push events
 * while a consumer (e.g. handleArchitectPhase generator) yields them as SSE.
 */

interface Waiter<T> {
  resolve: (result: IteratorResult<T>) => void;
}

export class EventChannel<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private waiters: Waiter<T>[] = [];
  private closed = false;

  /** Producer pushes an event into the channel. */
  push(event: T): void {
    if (this.closed) return;

    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter.resolve({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }

  /** Producer signals no more events will be pushed. */
  close(): void {
    this.closed = true;
    // Resolve all waiting consumers with done
    for (const waiter of this.waiters) {
      waiter.resolve({ value: undefined as any, done: true });
    }
    this.waiters = [];
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        // If there are queued events, return immediately
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false });
        }

        // If channel is closed and no queued events, we're done
        if (this.closed) {
          return Promise.resolve({ value: undefined as any, done: true });
        }

        // Otherwise wait for next push or close
        return new Promise<IteratorResult<T>>((resolve) => {
          this.waiters.push({ resolve });
        });
      },
    };
  }
}
