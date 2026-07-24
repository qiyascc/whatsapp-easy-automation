const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.[\]]+)\s*\}\}/g;

export class Template {
  static render(text, scope = {}) {
    if (text === null || text === undefined) return '';
    return String(text).replace(PLACEHOLDER, (match, expression) => {
      const value = Template.resolve(expression, scope);
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value);
        } catch {
          return '';
        }
      }
      return String(value);
    });
  }

  static resolve(expression, scope) {
    const segments = String(expression)
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .filter(Boolean);
    let cursor = scope;
    for (const segment of segments) {
      if (cursor === null || cursor === undefined) return null;
      if (typeof cursor !== 'object') return null;
      cursor = cursor[segment];
    }
    return cursor === undefined ? null : cursor;
  }

  static buildScope({ contact = null, payload = {}, variables = {}, now = new Date() } = {}) {
    return {
      phone: contact?.phone ?? payload.phone ?? '',
      name: contact?.name ?? payload.name ?? '',
      status: contact?.status ?? '',
      contact: contact ?? {},
      text: payload.text ?? '',
      sender: payload.sender ?? '',
      chat: payload.chat ?? '',
      command: payload.command ?? '',
      args: payload.args ?? '',
      source: payload.source ?? '',
      payload: payload.data ?? {},
      vars: variables ?? {},
      date: now.toISOString().slice(0, 10),
      time: now.toISOString().slice(11, 19),
      timestamp: now.getTime()
    };
  }
}
