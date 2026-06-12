/**
 * Simple in-memory sliding window rate limiter.
 *
 * Works correctly on a persistent Node.js process (Next.js with runtime="nodejs"
 * on Termux). Not suitable for multi-instance / serverless deployments — swap
 * for a Redis-backed implementation when moving to production clusters.
 */

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

class SlidingWindowRateLimiter {
  // userId → sorted array of request timestamps (ms)
  private readonly windows = new Map<string, number[]>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Drop timestamps outside the current window
    const timestamps = (this.windows.get(key) ?? []).filter(
      (t) => t > windowStart,
    );

    if (timestamps.length >= this.maxRequests) {
      // Oldest timestamp in window tells us when a slot frees up
      const oldestInWindow = timestamps[0]!;
      const resetInSeconds = Math.ceil(
        (oldestInWindow + this.windowMs - now) / 1000,
      );
      return { allowed: false, remaining: 0, resetInSeconds };
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);

    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      resetInSeconds: 0,
    };
  }

  /** Expose current usage — useful for logging / debugging */
  usage(key: string): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    return (this.windows.get(key) ?? []).filter((t) => t > windowStart).length;
  }
}

/**
 * AI extraction rate limiter.
 * 20 uploads per user per hour.
 * Adjust MAX_AI_UPLOADS_PER_HOUR to taste.
 */
export const MAX_AI_UPLOADS_PER_HOUR = 20;

export const aiUploadLimiter = new SlidingWindowRateLimiter(
  MAX_AI_UPLOADS_PER_HOUR,
  60 * 60 * 1000, // 1 hour in ms
);