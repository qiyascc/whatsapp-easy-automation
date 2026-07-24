import { BaseRepository } from './BaseRepository.js';
import { safeJsonParse } from '../../core/Support.js';

export class WorkflowRepository extends BaseRepository {
  static toDto(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: Boolean(row.enabled),
      graph: safeJsonParse(row.graph, { nodes: [], edges: [] }),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  list() {
    return this.database.prepare('SELECT * FROM workflows ORDER BY id ASC').all().map(WorkflowRepository.toDto);
  }

  listEnabled() {
    return this.database.prepare('SELECT * FROM workflows WHERE enabled = 1 ORDER BY id ASC').all().map(WorkflowRepository.toDto);
  }

  find(id) {
    return WorkflowRepository.toDto(this.database.prepare('SELECT * FROM workflows WHERE id = ?').get([id]));
  }

  create({ name, description = '', graph, enabled = false }) {
    const now = this.now();
    const result = this.database
      .prepare(`
        INSERT INTO workflows (name, description, enabled, graph, created_at, updated_at)
        VALUES (@name, @description, @enabled, @graph, @now, @now)
      `)
      .run({ name, description, enabled: enabled ? 1 : 0, graph: JSON.stringify(graph), now });
    return Number(result.lastInsertRowid);
  }

  update(id, { name, description, graph, enabled }) {
    const assignments = [];
    const values = { id, updatedAt: this.now() };
    if (name !== undefined) {
      assignments.push('name = @name');
      values.name = name;
    }
    if (description !== undefined) {
      assignments.push('description = @description');
      values.description = description;
    }
    if (graph !== undefined) {
      assignments.push('graph = @graph');
      values.graph = JSON.stringify(graph);
    }
    if (enabled !== undefined) {
      assignments.push('enabled = @enabled');
      values.enabled = enabled ? 1 : 0;
    }
    if (!assignments.length) return;
    this.database.prepare(`UPDATE workflows SET ${assignments.join(', ')}, updated_at = @updatedAt WHERE id = @id`).run(values);
  }

  delete(id) {
    return this.database.prepare('DELETE FROM workflows WHERE id = ?').run([id]).changes;
  }
}
