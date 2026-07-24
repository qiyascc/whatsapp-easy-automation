export class BaseRepository {
  constructor(database) {
    this.database = database;
  }

  now() {
    return Date.now();
  }

  buildAssignment(fields, allowed) {
    const values = {};
    const assignments = [];
    for (const [key, value] of Object.entries(fields)) {
      if (!allowed.has(key)) continue;
      assignments.push(`${key} = @${key}`);
      values[key] = value;
    }
    return { assignments, values };
  }
}
