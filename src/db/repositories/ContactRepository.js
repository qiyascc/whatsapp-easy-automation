import { BaseRepository } from './BaseRepository.js';

const UPDATABLE = new Set(['jid', 'name', 'status', 'source', 'last_error', 'invited_at', 'joined_at']);
const STATUSES = Object.freeze(['pending', 'invited', 'in_group', 'failed', 'invalid', 'blocked']);

export class ContactRepository extends BaseRepository {
  static get statuses() {
    return STATUSES;
  }

  static toDto(row) {
    if (!row) return null;
    return {
      id: row.id,
      phone: row.phone,
      jid: row.jid,
      name: row.name,
      status: row.status,
      source: row.source,
      lastError: row.last_error,
      invitedAt: row.invited_at,
      joinedAt: row.joined_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  upsert({ phone, name = null, source = null, status = 'pending' }) {
    const now = this.now();
    const existing = this.findByPhone(phone);
    if (existing) {
      if (name && !existing.name) this.update(existing.id, { name });
      return { contact: this.findByPhone(phone), created: false };
    }
    this.database
      .prepare(`
        INSERT INTO contacts (phone, name, source, status, created_at, updated_at)
        VALUES (@phone, @name, @source, @status, @now, @now)
        ON CONFLICT(phone) DO NOTHING
      `)
      .run({ phone, name, source, status: STATUSES.includes(status) ? status : 'pending', now });
    return { contact: this.findByPhone(phone), created: true };
  }

  findByPhone(phone) {
    return ContactRepository.toDto(this.database.prepare('SELECT * FROM contacts WHERE phone = ?').get([phone]));
  }

  findById(id) {
    return ContactRepository.toDto(this.database.prepare('SELECT * FROM contacts WHERE id = ?').get([id]));
  }

  list({ status = '', search = '', limit = 50, offset = 0 } = {}) {
    const clauses = [];
    const filters = {};
    if (status && STATUSES.includes(status)) {
      clauses.push('status = @status');
      filters.status = status;
    }
    if (search) {
      clauses.push('(phone LIKE @search OR name LIKE @search OR source LIKE @search)');
      filters.search = `%${search}%`;
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.database
      .prepare(`SELECT * FROM contacts ${where} ORDER BY updated_at DESC, id DESC LIMIT @limit OFFSET @offset`)
      .all({ ...filters, limit, offset });
    const total = this.database.prepare(`SELECT COUNT(*) AS total FROM contacts ${where}`).get(filters)?.total ?? 0;
    return { contacts: rows.map(ContactRepository.toDto), total };
  }

  listByStatus(status, limit = 500) {
    return this.database
      .prepare('SELECT * FROM contacts WHERE status = ? ORDER BY id ASC LIMIT ?')
      .all([status, limit])
      .map(ContactRepository.toDto);
  }

  listAll(limit = 5000) {
    return this.database.prepare('SELECT * FROM contacts ORDER BY id ASC LIMIT ?').all([limit]).map(ContactRepository.toDto);
  }

  update(id, fields) {
    const { assignments, values } = this.buildAssignment(fields, UPDATABLE);
    if (!assignments.length) return;
    this.database
      .prepare(`UPDATE contacts SET ${assignments.join(', ')}, updated_at = @updatedAt WHERE id = @id`)
      .run({ ...values, updatedAt: this.now(), id });
  }

  delete(id) {
    return this.database.prepare('DELETE FROM contacts WHERE id = ?').run([id]).changes;
  }

  deleteMany(ids) {
    if (!ids.length) return 0;
    const placeholders = ids.map(() => '?').join(',');
    return this.database.prepare(`DELETE FROM contacts WHERE id IN (${placeholders})`).run(ids).changes;
  }

  statusCounts() {
    const counts = { total: 0 };
    for (const status of STATUSES) counts[status] = 0;
    for (const row of this.database.prepare('SELECT status, COUNT(*) AS total FROM contacts GROUP BY status').all()) {
      counts[row.status] = row.total;
      counts.total += row.total;
    }
    return counts;
  }
}
