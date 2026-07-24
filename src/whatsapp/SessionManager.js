import fs from 'node:fs';
import path from 'node:path';
import { WhatsAppSession } from './WhatsAppSession.js';
import { sanitizeIdentifier } from '../core/Support.js';
import { NotFoundError, ValidationError } from '../core/AppError.js';

export class SessionManager {
  #sessions = new Map();

  constructor({ config, logger, eventBus }) {
    this.config = config;
    this.logger = logger;
    this.eventBus = eventBus;
    fs.mkdirSync(config.sessionsDir, { recursive: true });
  }

  static requireExactId(raw) {
    const value = String(raw ?? '');
    const safeId = sanitizeIdentifier(value);
    if (!safeId || safeId !== value) {
      throw new ValidationError('A session id may only contain letters, digits, dashes and underscores.');
    }
    return safeId;
  }

  directoryFor(id) {
    const safeId = sanitizeIdentifier(id);
    if (!safeId) throw new ValidationError('A session id may only contain letters, digits, dashes and underscores.');
    const target = path.join(this.config.sessionsDir, safeId);
    const resolved = path.resolve(target);
    const root = path.resolve(this.config.sessionsDir);
    if (resolved !== path.join(root, safeId)) {
      throw new ValidationError('The session id resolved outside of the sessions directory.');
    }
    return resolved;
  }

  list() {
    return [...this.#sessions.values()].map((session) => session.snapshot());
  }

  get(id) {
    const safeId = sanitizeIdentifier(id);
    return this.#sessions.get(safeId) ?? null;
  }

  require(id) {
    const session = this.get(id);
    if (!session) throw new NotFoundError('Session');
    return session;
  }

  hasOpen() {
    return [...this.#sessions.values()].some((session) => session.isOpen);
  }

  openSessions() {
    return [...this.#sessions.values()].filter((session) => session.isOpen);
  }

  pickOpen(preferredId = '') {
    const preferred = preferredId ? this.get(preferredId) : null;
    if (preferred?.isOpen) return preferred;
    return this.openSessions()[0] ?? null;
  }

  async create(rawId) {
    const id = sanitizeIdentifier(rawId, `session_${Date.now()}`);
    const existing = this.#sessions.get(id);
    if (existing && existing.status !== 'closed' && existing.status !== 'error') return existing;

    const session = existing ?? new WhatsAppSession({
      id,
      directory: this.directoryFor(id),
      logger: this.logger.child(`wa:${id}`),
      eventBus: this.eventBus
    });
    this.#sessions.set(id, session);
    await session.start();
    return session;
  }

  async restore() {
    const entries = fs.readdirSync(this.config.sessionsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    for (const entry of entries) {
      const id = sanitizeIdentifier(entry.name);
      if (!id) continue;
      const directory = this.directoryFor(id);
      if (!fs.existsSync(path.join(directory, 'creds.json'))) {
        fs.rmSync(directory, { recursive: true, force: true });
        continue;
      }
      try {
        await this.create(id);
        this.logger.info(`Restored WhatsApp session "${id}".`);
      } catch (error) {
        this.logger.error(`Could not restore session "${id}".`, { reason: error.message });
      }
    }
  }

  async remove(id) {
    const safeId = SessionManager.requireExactId(id);
    const session = this.#sessions.get(safeId);
    const directory = this.directoryFor(safeId);
    if (session) {
      await session.destroy();
      this.#sessions.delete(safeId);
    } else {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    this.logger.info(`Session "${safeId}" was removed.`);
  }

  async shutdown() {
    for (const session of this.#sessions.values()) {
      await session.stop();
    }
  }
}
