import { BaseRepository } from './BaseRepository.js';
import { safeJsonParse } from '../../core/Support.js';

const STATUSES = Object.freeze(['active', 'waiting', 'done', 'failed', 'cancelled']);

export class RunRepository extends BaseRepository {
  static get statuses() {
    return STATUSES;
  }

  static toDto(row) {
    if (!row) return null;
    return {
      id: row.id,
      workflowId: row.workflow_id,
      workflowName: row.workflow_name ?? null,
      contactId: row.contact_id,
      contactPhone: row.contact_phone ?? null,
      contactName: row.contact_name ?? null,
      dedupeKey: row.dedupe_key,
      status: row.status,
      cursorNode: row.cursor_node,
      resumeAt: row.resume_at,
      attempts: row.attempts,
      context: safeJsonParse(row.context, {}),
      payload: safeJsonParse(row.payload, {}),
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  create({ workflowId, contactId = null, dedupeKey = null, payload = {}, cursorNode = null }) {
    const now = this.now();
    const result = this.database
      .prepare(`
        INSERT INTO runs (workflow_id, contact_id, dedupe_key, status, cursor_node, payload, context, created_at, updated_at)
        VALUES (@workflowId, @contactId, @dedupeKey, 'active', @cursorNode, @payload, '{}', @now, @now)
        ON CONFLICT DO NOTHING
      `)
      .run({
        workflowId,
        contactId,
        dedupeKey,
        cursorNode,
        payload: JSON.stringify(payload ?? {}),
        now
      });
    if (!result.changes) return null;
    return this.find(Number(result.lastInsertRowid));
  }

  find(id) {
    return RunRepository.toDto(this.database.prepare('SELECT * FROM runs WHERE id = ?').get([id]));
  }

  findDue({ workflowIds, limit, now }) {
    if (!workflowIds.length) return [];
    const placeholders = workflowIds.map(() => '?').join(',');
    const rows = this.database
      .prepare(`
        SELECT * FROM runs
        WHERE workflow_id IN (${placeholders})
          AND (status = 'active' OR (status = 'waiting' AND (resume_at IS NULL OR resume_at <= ?)))
        ORDER BY COALESCE(resume_at, created_at) ASC, id ASC
        LIMIT ?
      `)
      .all([...workflowIds, now, limit]);
    return rows.map(RunRepository.toDto);
  }

  update(id, fields) {
    const allowed = new Map([
      ['status', 'status'],
      ['cursorNode', 'cursor_node'],
      ['resumeAt', 'resume_at'],
      ['attempts', 'attempts'],
      ['context', 'context'],
      ['payload', 'payload'],
      ['contactId', 'contact_id'],
      ['lastError', 'last_error']
    ]);
    const assignments = [];
    const values = { id, updatedAt: this.now() };
    for (const [key, column] of allowed.entries()) {
      if (fields[key] === undefined) continue;
      assignments.push(`${column} = @${key}`);
      values[key] = key === 'context' || key === 'payload' ? JSON.stringify(fields[key] ?? {}) : fields[key];
    }
    if (!assignments.length) return;
    this.database.prepare(`UPDATE runs SET ${assignments.join(', ')}, updated_at = @updatedAt WHERE id = @id`).run(values);
  }

  list({ workflowId = null, status = '', limit = 100 } = {}) {
    const clauses = [];
    const params = { limit };
    if (workflowId) {
      clauses.push('r.workflow_id = @workflowId');
      params.workflowId = workflowId;
    }
    if (status && STATUSES.includes(status)) {
      clauses.push('r.status = @status');
      params.status = status;
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.database
      .prepare(`
        SELECT r.*, w.name AS workflow_name, c.phone AS contact_phone, c.name AS contact_name
        FROM runs r
        LEFT JOIN workflows w ON w.id = r.workflow_id
        LEFT JOIN contacts c ON c.id = r.contact_id
        ${where}
        ORDER BY r.updated_at DESC, r.id DESC
        LIMIT @limit
      `)
      .all(params)
      .map(RunRepository.toDto);
  }

  statsByWorkflow() {
    const stats = {};
    for (const row of this.database.prepare('SELECT workflow_id, status, COUNT(*) AS total FROM runs GROUP BY workflow_id, status').all()) {
      stats[row.workflow_id] = stats[row.workflow_id] || { active: 0, waiting: 0, done: 0, failed: 0, cancelled: 0 };
      stats[row.workflow_id][row.status] = row.total;
    }
    return stats;
  }

  statusCounts() {
    const counts = { active: 0, waiting: 0, done: 0, failed: 0, cancelled: 0 };
    for (const row of this.database.prepare('SELECT status, COUNT(*) AS total FROM runs GROUP BY status').all()) {
      counts[row.status] = row.total;
    }
    return counts;
  }

  hasRunForDedupe(workflowId, dedupeKey) {
    return this.database
      .prepare('SELECT 1 AS present FROM runs WHERE workflow_id = ? AND dedupe_key = ?')
      .get([workflowId, dedupeKey]) !== null;
  }

  deleteByStatus(status) {
    if (!STATUSES.includes(status)) return 0;
    return this.database.prepare('DELETE FROM runs WHERE status = ?').run([status]).changes;
  }

  deleteFinished() {
    return this.database.prepare("DELETE FROM runs WHERE status IN ('done','failed','cancelled')").run().changes;
  }

  pruneFinished(olderThan) {
    return this.database
      .prepare("DELETE FROM runs WHERE status IN ('done','cancelled') AND updated_at < ?")
      .run([olderThan]).changes;
  }
}
