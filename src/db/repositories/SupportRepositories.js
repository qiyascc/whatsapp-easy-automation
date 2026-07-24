import { BaseRepository } from './BaseRepository.js';

export class LogRepository extends BaseRepository {
  static toDto(row) {
    return { id: row.id, ts: row.ts, level: row.level, message: row.message, context: row.context };
  }

  append(level, message, context = null) {
    this.database
      .prepare('INSERT INTO logs (ts, level, message, context) VALUES (@ts, @level, @message, @context)')
      .run({ ts: this.now(), level, message: String(message).slice(0, 2000), context });
  }

  list({ level = '', limit = 100 } = {}) {
    if (level) {
      return this.database
        .prepare('SELECT * FROM logs WHERE level = ? ORDER BY id DESC LIMIT ?')
        .all([level, limit])
        .map(LogRepository.toDto);
    }
    return this.database.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT ?').all([limit]).map(LogRepository.toDto);
  }

  prune(olderThan, keepLast = 2000) {
    this.database.prepare('DELETE FROM logs WHERE ts < ?').run([olderThan]);
    this.database
      .prepare('DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT ?)')
      .run([keepLast]);
  }
}

export class CounterRepository extends BaseRepository {
  static today() {
    return new Date().toISOString().slice(0, 10);
  }

  value(scope, day = CounterRepository.today()) {
    const row = this.database.prepare('SELECT value FROM counters WHERE scope = ? AND day = ?').get([scope, day]);
    return row?.value ?? 0;
  }

  increment(scope, day = CounterRepository.today()) {
    this.database
      .prepare(`
        INSERT INTO counters (scope, day, value) VALUES (@scope, @day, 1)
        ON CONFLICT(scope, day) DO UPDATE SET value = value + 1
      `)
      .run({ scope, day });
    return this.value(scope, day);
  }

  totalForDay(day = CounterRepository.today()) {
    const row = this.database.prepare('SELECT SUM(value) AS total FROM counters WHERE day = ?').get([day]);
    return row?.total ?? 0;
  }

  prune(beforeDay) {
    this.database.prepare('DELETE FROM counters WHERE day < ?').run([beforeDay]);
  }
}

export class StateRepository extends BaseRepository {
  get(key, fallback = null) {
    const row = this.database.prepare('SELECT value FROM runtime_state WHERE key = ?').get([key]);
    return row ? row.value : fallback;
  }

  number(key, fallback = 0) {
    const value = Number.parseInt(this.get(key, ''), 10);
    return Number.isFinite(value) ? value : fallback;
  }

  set(key, value) {
    this.database
      .prepare(`
        INSERT INTO runtime_state (key, value, updated_at) VALUES (@key, @value, @now)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `)
      .run({ key, value: String(value), now: this.now() });
  }

  delete(key) {
    this.database.prepare('DELETE FROM runtime_state WHERE key = ?').run([key]);
  }

  deletePrefix(prefix) {
    this.database.prepare('DELETE FROM runtime_state WHERE key LIKE ?').run([`${prefix}%`]);
  }

  deletePrefixOlderThan(prefix, timestamp) {
    return this.database
      .prepare('DELETE FROM runtime_state WHERE key LIKE ? AND updated_at < ?')
      .run([`${prefix}%`, timestamp]).changes;
  }
}
