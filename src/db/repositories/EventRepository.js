import { BaseRepository } from './BaseRepository.js';
import { safeJsonParse } from '../../core/Support.js';

export class EventRepository extends BaseRepository {
  static toDto(row) {
    if (!row) return null;
    return {
      id: row.id,
      source: row.source,
      externalId: row.external_id,
      sender: row.sender,
      chat: row.chat,
      name: row.name,
      text: row.text,
      data: safeJsonParse(row.payload, {}),
      createdAt: row.created_at
    };
  }

  append({ source, externalId = null, sender = null, chat = null, name = null, text = '', data = {} }) {
    const result = this.database
      .prepare(`
        INSERT INTO trigger_events (source, external_id, sender, chat, name, text, payload, created_at)
        VALUES (@source, @externalId, @sender, @chat, @name, @text, @payload, @now)
        ON CONFLICT DO NOTHING
      `)
      .run({
        source,
        externalId,
        sender,
        chat,
        name,
        text: String(text ?? ''),
        payload: JSON.stringify(data ?? {}),
        now: this.now()
      });
    if (!result.changes) return null;
    return Number(result.lastInsertRowid);
  }

  readAfter(source, cursorId, limit) {
    return this.database
      .prepare('SELECT * FROM trigger_events WHERE source = ? AND id > ? ORDER BY id ASC LIMIT ?')
      .all([source, cursorId, limit])
      .map(EventRepository.toDto);
  }

  latestId(source) {
    const row = this.database.prepare('SELECT MAX(id) AS latest FROM trigger_events WHERE source = ?').get([source]);
    return row?.latest ?? 0;
  }

  prune(olderThan) {
    return this.database.prepare('DELETE FROM trigger_events WHERE created_at < ?').run([olderThan]).changes;
  }
}
