import { MailIngestor } from './MailIngestor.js';
import { TelegramIngestor } from './TelegramIngestor.js';
import { WhatsAppIngestor, WebhookIngestor } from './PushIngestors.js';
import { clamp } from '#core/Support.js';

const PRUNE_INTERVAL_MS = 3600000;

export class IngestManager {
  #ingestors = new Map();
  #lastRunAt = new Map();
  #inFlight = new Set();
  #detachers = [];
  #lastPruneAt = 0;

  constructor(dependencies) {
    this.logger = dependencies.logger;
    this.events = dependencies.events;
    this.settings = dependencies.settings;

    for (const Factory of [MailIngestor, TelegramIngestor, WhatsAppIngestor, WebhookIngestor]) {
      const ingestor = new Factory({ ...dependencies, logger: dependencies.logger.child(`ingest:${Factory.source}`) });
      this.#ingestors.set(Factory.source, ingestor);
    }
  }

  get sources() {
    return [...this.#ingestors.keys()];
  }

  get(source) {
    return this.#ingestors.get(source) ?? null;
  }

  webhook() {
    return this.#ingestors.get(WebhookIngestor.source);
  }

  start() {
    for (const ingestor of this.#ingestors.values()) {
      if (!ingestor.isPushBased) continue;
      this.#detachers.push(ingestor.attach());
    }
  }

  stop() {
    for (const detach of this.#detachers) detach();
    this.#detachers = [];
  }

  async pump(activeSources) {
    const now = Date.now();
    const work = [];
    for (const [source, ingestor] of this.#ingestors.entries()) {
      if (ingestor.isPushBased) continue;
      if (!activeSources.has(source)) continue;
      if (!ingestor.isConfigured()) continue;
      if (this.#inFlight.has(source)) continue;
      const last = this.#lastRunAt.get(source) ?? 0;
      if (now - last < ingestor.pollIntervalMs) continue;
      this.#lastRunAt.set(source, now);
      this.#inFlight.add(source);
      work.push(
        ingestor
          .collect()
          .catch((error) => this.logger.error(`Ingestor "${source}" crashed.`, { reason: error.message }))
          .finally(() => this.#inFlight.delete(source))
      );
    }
    if (work.length) await Promise.all(work);
    this.#pruneIfDue(now);
  }

  #pruneIfDue(now) {
    if (now - this.#lastPruneAt < PRUNE_INTERVAL_MS) return;
    this.#lastPruneAt = now;
    const days = clamp(this.settings.number('retention_days', 14), 1, 365);
    const removed = this.events.prune(now - days * 86400000);
    if (removed > 0) this.logger.debug(`Pruned ${removed} stored trigger event(s).`);
  }
}
