/**
 * EventChannel — async iterable bridge for producer/consumer patterns.
 *
 * Allows a background producer (e.g. architect.run()) to push events
 * while a consumer (e.g. handleArchitectPhase generator) yields them as SSE.
 */

interface Waiter<T> {
  resolve: (result: IteratorResult<T>) => void;
}

/** Default max queue size — prevents unbounded memory growth if consumer stalls. */
const DEFAULT_MAX_QUEUE_SIZE = 10_000;

export class EventChannel<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private waiters: Waiter<T>[] = [];
  private closed = false;
  private readonly maxQueueSize: number;
  private overflowWarned = false;

  constructor(maxQueueSize: number = DEFAULT_MAX_QUEUE_SIZE) {
    this.maxQueueSize = maxQueueSize;
  }

  /** Producer pushes an event into the channel. */
  push(event: T): void {
    if (this.closed) return;

    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter.resolve({ value: event, done: false });
    } else {
      // Drop oldest events when queue exceeds capacity to prevent OOM
      if (this.queue.length >= this.maxQueueSize) {
        this.queue.shift();
        if (!this.overflowWarned) {
          this.overflowWarned = true;
          console.warn(`[EventChannel] Queue overflow — dropping oldest events (max ${this.maxQueueSize})`);
        }
      }
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
