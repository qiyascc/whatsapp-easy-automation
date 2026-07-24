export function sleep(ms, signal) {
  return new Promise((resolve) => {
    const duration = Math.max(0, Number(ms) || 0);
    const timer = setTimeout(resolve, duration);
    if (timer.unref) timer.unref();
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    }
  });
}

export function randomInt(min, max) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function toBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;
  return fallback;
}

export function safeJsonParse(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? null) ?? fallback;
  } catch {
    return fallback;
  }
}

export function truncate(value, length) {
  const text = String(value ?? '');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

export function sanitizeIdentifier(value, fallback = '') {
  const cleaned = String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return cleaned || fallback;
}

export function withTimeout(promise, ms, message = 'Operation timed out.') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export class TtlCache {
  #entries = new Map();
  #ttlMs;

  constructor(ttlMs) {
    this.#ttlMs = ttlMs;
  }

  get(key) {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    this.#entries.set(key, { value, expiresAt: Date.now() + this.#ttlMs });
    return value;
  }

  delete(key) {
    this.#entries.delete(key);
  }

  clear() {
    this.#entries.clear();
  }

  async resolve(key, factory) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await factory();
    return this.set(key, value);
  }
}

export class SlidingWindowLimiter {
  #hits = new Map();
  #limit;
  #windowMs;

  constructor({ limit, windowMs }) {
    this.#limit = limit;
    this.#windowMs = windowMs;
  }

  check(key) {
    const now = Date.now();
    const bucket = (this.#hits.get(key) || []).filter((stamp) => now - stamp < this.#windowMs);
    if (bucket.length >= this.#limit) {
      const retryAfterSeconds = Math.ceil((this.#windowMs - (now - bucket[0])) / 1000);
      return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
    }
    bucket.push(now);
    this.#hits.set(key, bucket);
    if (this.#hits.size > 5000) this.#prune(now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  reset(key) {
    this.#hits.delete(key);
  }

  #prune(now) {
    for (const [key, stamps] of this.#hits.entries()) {
      const alive = stamps.filter((stamp) => now - stamp < this.#windowMs);
      if (alive.length === 0) this.#hits.delete(key);
      else this.#hits.set(key, alive);
    }
  }
}
