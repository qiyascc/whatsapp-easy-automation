export class Migrator {
  #database;
  #logger;
  #migrations;

  constructor({ database, migrations, logger }) {
    this.#database = database;
    this.#migrations = [...migrations].sort((left, right) => left.version - right.version);
    this.#logger = logger;
  }

  run(context = {}) {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);

    const applied = new Set(
      this.#database.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version)
    );

    let executed = 0;
    for (const migration of this.#migrations) {
      if (applied.has(migration.version)) continue;
      this.#database.transaction(() => {
        migration.up({ ...context, database: this.#database, logger: this.#logger });
        this.#database
          .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (@version, @name, @appliedAt)')
          .run({ version: migration.version, name: migration.name, appliedAt: Date.now() });
      });
      executed += 1;
      this.#logger?.info(`Applied migration ${migration.version} (${migration.name}).`);
    }
    return executed;
  }
}
