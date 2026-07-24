import { clamp, randomInt } from '#core/Support.js';

const QUOTA_COOLDOWN_MS = 1800000;

export class Pacer {
  #nextAllowedAt = new Map();

  constructor({ settings, counters, logger }) {
    this.settings = settings;
    this.counters = counters;
    this.logger = logger;
  }

  get minDelayMs() {
    return clamp(this.settings.number('pacing_min_seconds', 20), 1, 3600) * 1000;
  }

  get maxDelayMs() {
    return clamp(this.settings.number('pacing_max_seconds', 60), 1, 7200) * 1000;
  }

  get dailyLimit() {
    return clamp(this.settings.number('daily_limit_per_session', 40), 1, 100000);
  }

  readyAt(sessionKey) {
    return this.#nextAllowedAt.get(sessionKey) ?? 0;
  }

  canAct(sessionKey, now = Date.now()) {
    return now >= this.readyAt(sessionKey);
  }

  reserve(sessionKey, now = Date.now()) {
    const minimum = this.minDelayMs;
    const maximum = Math.max(minimum, this.maxDelayMs);
    const next = now + randomInt(minimum, maximum);
    this.#nextAllowedAt.set(sessionKey, next);
    return next;
  }

  quotaReached(sessionKey) {
    return this.counters.value(`session:${sessionKey}`) >= this.dailyLimit;
  }

  recordAction(sessionKey) {
    return this.counters.increment(`session:${sessionKey}`);
  }

  get quotaCooldownMs() {
    return QUOTA_COOLDOWN_MS;
  }
}
