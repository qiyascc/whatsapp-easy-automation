import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export class Config {
  static fromEnvironment(env = process.env) {
    return new Config(env);
  }

  constructor(env = {}) {
    this.version = '2.0.0';
    this.rootDir = ROOT_DIR;
    this.dataDir = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(ROOT_DIR, 'data');
    this.sessionsDir = env.SESSIONS_DIR ? path.resolve(env.SESSIONS_DIR) : path.join(ROOT_DIR, 'sessions');
    this.publicDir = path.join(ROOT_DIR, 'public');
    this.databaseFile = path.join(this.dataDir, 'app.db');
    this.masterKeyFile = path.join(this.dataDir, 'master.key');

    this.host = env.HOST || '127.0.0.1';
    this.port = Config.readInteger(env.PORT, 9333, 1, 65535);
    this.adminToken = String(env.AUTH_TOKEN || '').trim();
    this.masterSecret = String(env.APP_SECRET || '').trim();
    this.trustProxy = env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true';
    this.publicBaseUrl = String(env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

    this.logLevel = env.LOG_LEVEL || 'info';
    this.requestBodyLimit = env.REQUEST_BODY_LIMIT || '256kb';
    this.engineIntervalMs = Config.readInteger(env.ENGINE_INTERVAL_MS, 5000, 1000, 600000);
    this.maxRunsPerTick = Config.readInteger(env.MAX_RUNS_PER_TICK, 25, 1, 500);
    this.maxRunAttempts = Config.readInteger(env.MAX_RUN_ATTEMPTS, 3, 1, 20);
    this.eventBatchSize = Config.readInteger(env.EVENT_BATCH_SIZE, 100, 1, 1000);
    this.shutdownTimeoutMs = Config.readInteger(env.SHUTDOWN_TIMEOUT_MS, 10000, 1000, 120000);
  }

  static readInteger(raw, fallback, min, max) {
    const value = Number.parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(value)) return fallback;
    if (min !== undefined && value < min) return min;
    if (max !== undefined && value > max) return max;
    return value;
  }

  get bindsPublicInterface() {
    return this.host === '0.0.0.0' || this.host === '::';
  }
}
