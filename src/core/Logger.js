const LEVEL_WEIGHT = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });
const CONSOLE_METHOD = Object.freeze({ debug: 'debug', info: 'log', warn: 'warn', error: 'error' });

export class Logger {
  #repository;
  #threshold;
  #scope;
  #sink;

  constructor({ repository = null, level = 'info', scope = 'app', sink = console } = {}) {
    this.#repository = repository;
    this.#threshold = LEVEL_WEIGHT[level] ?? LEVEL_WEIGHT.info;
    this.#scope = scope;
    this.#sink = sink;
  }

  child(scope) {
    const logger = new Logger({ repository: this.#repository, scope, sink: this.#sink });
    logger.setThreshold(this.#threshold);
    return logger;
  }

  setThreshold(weight) {
    this.#threshold = weight;
  }

  attachRepository(repository) {
    this.#repository = repository;
  }

  debug(message, context) {
    this.#write('debug', message, context);
  }

  info(message, context) {
    this.#write('info', message, context);
  }

  warn(message, context) {
    this.#write('warn', message, context);
  }

  error(message, context) {
    this.#write('error', message, context);
  }

  #write(level, message, context) {
    if ((LEVEL_WEIGHT[level] ?? 0) < this.#threshold) return;
    const text = String(message ?? '');
    const serialized = Logger.#serialize(context);
    const method = CONSOLE_METHOD[level] ?? 'log';
    this.#sink[method](`[${new Date().toISOString()}] ${level.toUpperCase()} ${this.#scope}: ${text}${serialized ? ` ${serialized}` : ''}`);
    if (level === 'debug') return;
    try {
      this.#repository?.append(level, `${this.#scope}: ${text}`, serialized);
    } catch {
      this.#sink.error('Logger failed to persist a record.');
    }
  }

  static #serialize(context) {
    if (context === undefined || context === null) return null;
    if (typeof context === 'string') return context;
    try {
      return JSON.stringify(context);
    } catch {
      return String(context);
    }
  }
}
