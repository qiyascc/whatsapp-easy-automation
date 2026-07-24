import { BaseRepository } from './BaseRepository.js';
import { safeJsonParse } from '../../core/Support.js';

export class ApiKeyRepository extends BaseRepository {
  static toDto(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: safeJsonParse(row.scopes, []),
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at
    };
  }

  create({ name, prefix, tokenHash, scopes }) {
    const result = this.database
      .prepare(`
        INSERT INTO api_keys (name, prefix, token_hash, scopes, created_at)
        VALUES (@name, @prefix, @tokenHash, @scopes, @now)
      `)
      .run({ name, prefix, tokenHash, scopes: JSON.stringify(scopes), now: this.now() });
    return Number(result.lastInsertRowid);
  }

  list() {
    return this.database.prepare('SELECT * FROM api_keys ORDER BY id DESC').all().map(ApiKeyRepository.toDto);
  }

  findByHash(tokenHash) {
    return ApiKeyRepository.toDto(
      this.database.prepare('SELECT * FROM api_keys WHERE token_hash = ? AND revoked_at IS NULL').get([tokenHash])
    );
  }

  find(id) {
    return ApiKeyRepository.toDto(this.database.prepare('SELECT * FROM api_keys WHERE id = ?').get([id]));
  }

  touch(id) {
    this.database.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run([this.now(), id]);
  }

  revoke(id) {
    return this.database.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run([this.now(), id]).changes;
  }

  countActiveWithScope(scope) {
    const rows = this.database.prepare('SELECT scopes FROM api_keys WHERE revoked_at IS NULL').all();
    return rows.filter((row) => safeJsonParse(row.scopes, []).includes(scope)).length;
  }
}
