import fs from 'node:fs';
import path from 'node:path';

export class Statement {
  #statement;

  constructor(statement) {
    this.#statement = statement;
  }

  run(params) {
    return this.#statement.run(...Statement.#args(params));
  }

  get(params) {
    return this.#statement.get(...Statement.#args(params)) ?? null;
  }

  all(params) {
    return this.#statement.all(...Statement.#args(params)) ?? [];
  }

  static #args(params) {
    if (params === undefined) return [];
    if (Array.isArray(params)) return params.map(Statement.#value);
    if (params !== null && typeof params === 'object') return [Statement.#record(params)];
    return [Statement.#value(params)];
  }

  static #record(source) {
    const output = {};
    for (const [key, value] of Object.entries(source)) {
      output[key] = Statement.#value(value);
    }
    return output;
  }

  static #value(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  }
}

export class Database {
  #handle;
  #driver;
  #cache = new Map();

  constructor(handle, driver) {
    this.#handle = handle;
    this.#driver = driver;
  }

  static async open(filePath, logger = null) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    try {
      const { default: BetterSqlite3 } = await import('better-sqlite3');
      const handle = new BetterSqlite3(filePath);
      const database = new Database(handle, 'better-sqlite3');
      database.#configure();
      logger?.info('Database opened with better-sqlite3.');
      return database;
    } catch (error) {
      const [major, minor] = process.versions.node.split('.').map((part) => Number.parseInt(part, 10));
      if (major < 22 || (major === 22 && minor < 5)) {
        throw new Error(`better-sqlite3 is unavailable and node:sqlite requires Node 22.5+ (running ${process.versions.node}): ${error.message}`);
      }
      const { DatabaseSync } = await import('node:sqlite');
      const handle = new DatabaseSync(filePath);
      const database = new Database(handle, 'node:sqlite');
      database.#configure();
      logger?.warn('better-sqlite3 unavailable, using built-in node:sqlite.', { reason: error.message });
      return database;
    }
  }

  get driver() {
    return this.#driver;
  }

  exec(sql) {
    this.#handle.exec(sql);
  }

  prepare(sql) {
    const cached = this.#cache.get(sql);
    if (cached) return cached;
    const statement = new Statement(this.#handle.prepare(sql));
    this.#cache.set(sql, statement);
    return statement;
  }

  transaction(work) {
    this.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.exec('ROLLBACK');
      } catch {
        this.#cache.clear();
      }
      throw error;
    }
  }

  tableExists(name) {
    return this.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get([name]) !== null;
  }

  columnNames(table) {
    try {
      return this.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
    } catch {
      return [];
    }
  }

  close() {
    this.#cache.clear();
    try {
      this.#handle.close();
    } catch {
      return;
    }
  }

  #configure() {
    this.exec('PRAGMA journal_mode = WAL;');
    this.exec('PRAGMA foreign_keys = ON;');
    this.exec('PRAGMA busy_timeout = 5000;');
    this.exec('PRAGMA synchronous = NORMAL;');
  }
}
