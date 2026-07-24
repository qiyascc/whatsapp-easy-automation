import { safeJsonParse } from '../core/Support.js';

const LEGACY_STATUS_MAP = Object.freeze({
  pending: 'pending',
  invited: 'invited',
  in_group: 'in_group',
  add_failed: 'failed',
  failed: 'failed',
  invalid: 'invalid',
  blocked: 'blocked'
});

const LEGACY_NODE_MAP = Object.freeze({
  trigger_mail: 'trigger_event',
  trigger_source: 'trigger_event',
  save_db: 'save_contact',
  send_contact: 'send_contact_card',
  delete_message: 'delete_last_message',
  react_message: 'react_last_message'
});

const LEGACY_SETTING_MAP = Object.freeze({
  gmail_user: 'mail_user',
  group_jid: 'default_group_jid',
  invite_message: 'default_invite_message',
  min_delay_seconds: 'pacing_min_seconds',
  max_delay_seconds: 'pacing_max_seconds',
  daily_limit_per_session: 'daily_limit_per_session',
  mail_poll_seconds: 'mail_poll_seconds'
});

function renameIfLegacy(database, table, requiredColumn) {
  if (!database.tableExists(table)) return false;
  if (database.columnNames(table).includes(requiredColumn)) return false;
  database.exec(`ALTER TABLE ${table} RENAME TO legacy_${table};`);
  return true;
}

function upgradeGraph(rawGraph) {
  const graph = safeJsonParse(rawGraph, { nodes: [], edges: [] });
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const upgraded = nodes.map((node) => {
    const type = LEGACY_NODE_MAP[node.type] || node.type;
    const params = { ...(node.params || {}) };
    if (node.type === 'trigger_mail' || node.type === 'trigger_source') {
      params.source = params.source || 'mail';
      params.match_mode = params.match_mode || 'any';
      params.extract = params.extract || 'text_numbers';
      params.fan_out = params.fan_out || 'per_contact';
      params.create_contacts = params.create_contacts || 'true';
    }
    if (node.type === 'wait' && params.minutes !== undefined) {
      params.amount = String(params.minutes);
      params.unit = 'minutes';
      delete params.minutes;
    }
    return {
      id: String(node.id),
      type,
      params,
      x: Number.isFinite(node.x) ? node.x : 40,
      y: Number.isFinite(node.y) ? node.y : 40
    };
  });
  const known = new Set(upgraded.map((node) => node.id));
  const cleanEdges = edges
    .filter((edge) => known.has(String(edge.from)) && known.has(String(edge.to)))
    .map((edge) => ({ from: String(edge.from), to: String(edge.to), out: edge.out || 'default' }));
  return { nodes: upgraded, edges: cleanEdges };
}

export const migrations = [
  {
    version: 1,
    name: 'core_schema',
    up({ database }) {
      renameIfLegacy(database, 'settings', 'updated_at');
      renameIfLegacy(database, 'workflows', 'description');

      database.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS secrets (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS contacts (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          phone      TEXT NOT NULL UNIQUE,
          jid        TEXT,
          name       TEXT,
          status     TEXT NOT NULL DEFAULT 'pending',
          source     TEXT,
          last_error TEXT,
          invited_at INTEGER,
          joined_at  INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS contacts_status_idx ON contacts(status);
        CREATE INDEX IF NOT EXISTS contacts_source_idx ON contacts(source);

        CREATE TABLE IF NOT EXISTS workflows (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          enabled     INTEGER NOT NULL DEFAULT 0,
          graph       TEXT NOT NULL,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS runs (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
          contact_id  INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
          dedupe_key  TEXT,
          status      TEXT NOT NULL DEFAULT 'active',
          cursor_node TEXT,
          resume_at   INTEGER,
          attempts    INTEGER NOT NULL DEFAULT 0,
          context     TEXT NOT NULL DEFAULT '{}',
          payload     TEXT NOT NULL DEFAULT '{}',
          last_error  TEXT,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS runs_dedupe_idx ON runs(workflow_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
        CREATE INDEX IF NOT EXISTS runs_due_idx ON runs(status, resume_at);
        CREATE INDEX IF NOT EXISTS runs_workflow_idx ON runs(workflow_id, status);

        CREATE TABLE IF NOT EXISTS trigger_events (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          source      TEXT NOT NULL,
          external_id TEXT,
          sender      TEXT,
          chat        TEXT,
          name        TEXT,
          text        TEXT,
          payload     TEXT NOT NULL DEFAULT '{}',
          created_at  INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS trigger_events_external_idx ON trigger_events(source, external_id) WHERE external_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS trigger_events_stream_idx ON trigger_events(source, id);

        CREATE TABLE IF NOT EXISTS api_keys (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          name         TEXT NOT NULL,
          prefix       TEXT NOT NULL,
          token_hash   TEXT NOT NULL UNIQUE,
          scopes       TEXT NOT NULL,
          created_at   INTEGER NOT NULL,
          last_used_at INTEGER,
          revoked_at   INTEGER
        );

        CREATE TABLE IF NOT EXISTS logs (
          id      INTEGER PRIMARY KEY AUTOINCREMENT,
          ts      INTEGER NOT NULL,
          level   TEXT NOT NULL,
          message TEXT NOT NULL,
          context TEXT
        );
        CREATE INDEX IF NOT EXISTS logs_ts_idx ON logs(ts);

        CREATE TABLE IF NOT EXISTS counters (
          scope TEXT NOT NULL,
          day   TEXT NOT NULL,
          value INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (scope, day)
        );

        CREATE TABLE IF NOT EXISTS runtime_state (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    }
  },
  {
    version: 2,
    name: 'import_legacy_data',
    up({ database, vault, logger }) {
      const now = Date.now();

      if (database.tableExists('legacy_settings')) {
        const insertSetting = database.prepare(
          'INSERT INTO settings (key, value, updated_at) VALUES (@key, @value, @now) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        );
        const insertSecret = database.prepare(
          'INSERT INTO secrets (key, value, updated_at) VALUES (@key, @value, @now) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        );
        for (const row of database.prepare('SELECT key, value FROM legacy_settings').all()) {
          if (!row.value) continue;
          if (row.key === 'gmail_app_password') {
            insertSecret.run({ key: 'mail_password', value: vault.encrypt(row.value), now });
            continue;
          }
          const mapped = LEGACY_SETTING_MAP[row.key];
          if (mapped) insertSetting.run({ key: mapped, value: String(row.value), now });
        }
        database.exec('DROP TABLE legacy_settings;');
      }

      if (database.tableExists('numbers')) {
        const insertContact = database.prepare(`
          INSERT INTO contacts (phone, jid, name, status, source, last_error, invited_at, joined_at, created_at, updated_at)
          VALUES (@phone, @jid, @name, @status, @source, @lastError, @invitedAt, @joinedAt, @createdAt, @updatedAt)
          ON CONFLICT(phone) DO NOTHING
        `);
        for (const row of database.prepare('SELECT * FROM numbers').all()) {
          const phone = String(row.phone || '').replace(/\D/g, '');
          if (!phone) continue;
          insertContact.run({
            phone,
            jid: row.jid || null,
            name: row.name || null,
            status: LEGACY_STATUS_MAP[row.status] || 'pending',
            source: row.source_email || 'legacy',
            lastError: row.last_error || null,
            invitedAt: row.link_sent_at || null,
            joinedAt: row.joined_at || null,
            createdAt: row.created_at || now,
            updatedAt: now
          });
        }
        logger?.info('Imported legacy contacts.');
      }

      if (database.tableExists('legacy_workflows')) {
        const insertWorkflow = database.prepare(`
          INSERT INTO workflows (id, name, description, enabled, graph, created_at, updated_at)
          VALUES (@id, @name, '', @enabled, @graph, @createdAt, @updatedAt)
        `);
        for (const row of database.prepare('SELECT * FROM legacy_workflows').all()) {
          insertWorkflow.run({
            id: row.id,
            name: row.name || 'Imported workflow',
            enabled: row.enabled ? 1 : 0,
            graph: JSON.stringify(upgradeGraph(row.graph)),
            createdAt: row.created_at || now,
            updatedAt: now
          });
        }
        logger?.info('Imported legacy workflows.');
      }

      if (database.tableExists('executions') && database.tableExists('numbers')) {
        const insertRun = database.prepare(`
          INSERT INTO runs (workflow_id, contact_id, dedupe_key, status, cursor_node, resume_at, attempts, context, payload, last_error, created_at, updated_at)
          SELECT
            e.workflow_id,
            c.id,
            'legacy:' || e.id,
            CASE WHEN e.status IN ('active','waiting','done','failed') THEN e.status ELSE 'done' END,
            e.current_node,
            e.resume_at,
            0,
            COALESCE(e.context, '{}'),
            '{}',
            e.last_error,
            @now,
            @now
          FROM executions e
          JOIN numbers n ON n.id = e.number_id
          JOIN contacts c ON c.phone = REPLACE(REPLACE(n.phone, '+', ''), ' ', '')
          WHERE EXISTS (SELECT 1 FROM workflows w WHERE w.id = e.workflow_id)
        `);
        insertRun.run({ now });
      }

      if (database.tableExists('log')) {
        database.prepare(`
          INSERT INTO logs (ts, level, message, context)
          SELECT ts, COALESCE(level, 'info'), message, NULL FROM log ORDER BY id DESC LIMIT 200
        `).run();
      }

      for (const legacy of ['executions', 'numbers', 'legacy_workflows', 'processed_mail', 'log']) {
        if (database.tableExists(legacy)) database.exec(`DROP TABLE ${legacy};`);
      }
    }
  }
];
