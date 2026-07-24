export class StatsService {
  constructor({ contacts, runs, counters, sessions }) {
    this.contacts = contacts;
    this.runs = runs;
    this.counters = counters;
    this.sessions = sessions;
  }

  snapshot() {
    const sessionList = this.sessions.list();
    return {
      contacts: this.contacts.statusCounts(),
      runs: this.runs.statusCounts(),
      sessions: {
        total: sessionList.length,
        open: sessionList.filter((session) => session.status === 'open').length
      },
      actionsToday: this.counters.totalForDay()
    };
  }
}
