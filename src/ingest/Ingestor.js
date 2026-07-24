export class Ingestor {
  static source = 'unknown';

  constructor({ events, settings, state, logger }) {
    this.events = events;
    this.settings = settings;
    this.state = state;
    this.logger = logger;
    this.running = false;
  }

  get source() {
    return this.constructor.source;
  }

  get pollIntervalMs() {
    return 60000;
  }

  get isPushBased() {
    return false;
  }

  isConfigured() {
    return true;
  }

  async collect() {
    return 0;
  }

  attach() {
    return () => {};
  }

  stateKey(suffix) {
    return `ingest:${this.source}:${suffix}`;
  }

  publish(event) {
    const id = this.events.append({ source: this.source, ...event });
    return id !== null;
  }
}
