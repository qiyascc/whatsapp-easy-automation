import { BaseRepository } from './BaseRepository.js';

export class SettingsRepository extends BaseRepository {
  static DEFAULTS = Object.freeze({
    pacing_min_seconds: '20',
    pacing_max_seconds: '60',
    daily_limit_per_session: '40',
    default_group_jid: '',
    default_invite_message: 'Hello! Use the link below to join our group:',
    mail_host: 'imap.gmail.com',
    mail_port: '993',
    mail_user: '',
    mail_poll_seconds: '60',
    telegram_poll_seconds: '10',
    retention_days: '14'
  });

  static SECRET_KEYS = Object.freeze(['mail_password', 'telegram_bot_token']);

  #vault;

  constructor(database, vault) {
    super(database);
    this.#vault = vault;
  }

  all() {
    const merged = { ...SettingsRepository.DEFAULTS };
    for (const row of this.database.prepare('SELECT key, value FROM settings').all()) {
      merged[row.key] = row.value;
    }
    return merged;
  }

  get(key) {
    const row = this.database.prepare('SELECT value FROM settings WHERE key = ?').get([key]);
    if (row) return row.value;
    return SettingsRepository.DEFAULTS[key] ?? '';
  }

  number(key, fallback = 0) {
    const value = Number.parseInt(this.get(key), 10);
    return Number.isFinite(value) ? value : fallback;
  }

  set(key, value) {
    this.database
      .prepare('INSERT INTO settings (key, value, updated_at) VALUES (@key, @value, @now) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .run({ key, value: String(value ?? ''), now: this.now() });
  }

  setMany(values) {
    this.database.transaction(() => {
      for (const [key, value] of Object.entries(values)) {
        if (!Object.prototype.hasOwnProperty.call(SettingsRepository.DEFAULTS, key)) continue;
        this.set(key, value);
      }
    });
  }

  secret(key) {
    const row = this.database.prepare('SELECT value FROM secrets WHERE key = ?').get([key]);
    return row ? this.#vault.decrypt(row.value) : '';
  }

  hasSecret(key) {
    const row = this.database.prepare('SELECT value FROM secrets WHERE key = ?').get([key]);
    return Boolean(row && row.value);
  }

  setSecret(key, plaintext) {
    if (!SettingsRepository.SECRET_KEYS.includes(key)) return;
    if (!plaintext) {
      this.database.prepare('DELETE FROM secrets WHERE key = ?').run([key]);
      return;
    }
    this.database
      .prepare('INSERT INTO secrets (key, value, updated_at) VALUES (@key, @value, @now) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .run({ key, value: this.#vault.encrypt(plaintext), now: this.now() });
  }

  secretFlags() {
    const flags = {};
    for (const key of SettingsRepository.SECRET_KEYS) flags[key] = this.hasSecret(key);
    return flags;
  }
}
