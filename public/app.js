const TOKEN_STORAGE_KEY = 'wa.apiKey';
const PUBLIC_ENDPOINTS = new Set(['/api/auth/status', '/api/auth/login', '/api/health']);
const CONTACT_STATUSES = ['pending', 'invited', 'in_group', 'failed', 'invalid', 'blocked'];
const RUN_STATUSES = ['active', 'waiting', 'done', 'failed', 'cancelled'];
const CLEARABLE_RUN_STATUSES = ['done', 'failed', 'cancelled'];
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const KEY_SCOPES = ['admin', 'webhook'];
const BUTTON_TYPES = ['reply', 'url', 'call'];
const CONTACTS_PAGE_SIZE = 50;
const NODE_WIDTH = 220;
const DRAG_THRESHOLD = 5;
const LONG_PRESS_MS = 650;
const DEFAULT_NODE_COLOR = '#3b82f6';

const TONE_BY_STATUS = {
  pending: 'muted',
  invited: 'blue',
  in_group: 'green',
  failed: 'red',
  invalid: 'amber',
  blocked: 'red',
  connecting: 'blue',
  qr: 'amber',
  open: 'green',
  closed: 'muted',
  error: 'red',
  active: 'blue',
  waiting: 'amber',
  done: 'green',
  cancelled: 'muted',
  debug: 'muted',
  info: 'blue',
  warn: 'amber'
};

const el = (tag, props, children) => {
  const node = document.createElement(tag);
  const attributes = props || {};
  for (const key of Object.keys(attributes)) {
    const value = attributes[key];
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') node.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'hidden' || key === 'selected' || key === 'multiple') node[key] = Boolean(value);
    else node.setAttribute(key, String(value));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
};

const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
};

const setChildren = (node, children) => {
  clear(node);
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
  }
};

const humanize = (value) => String(value === null || value === undefined ? '' : value)
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const truncate = (value, max) => {
  const text = String(value === null || value === undefined ? '' : value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const formatRelative = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return `in ${formatDuration(Math.abs(seconds))}`;
  if (seconds < 10) return 'just now';
  if (seconds < 86400) return `${formatDuration(seconds)} ago`;
  return date.toLocaleDateString();
};

const formatDuration = (totalSeconds) => {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
};

const formatClock = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleTimeString();
};

const statusPill = (status) => el('span', { class: `pill pill-${TONE_BY_STATUS[status] || 'muted'}`, text: humanize(status) || '—' });

const button = (label, options) => {
  const config = options || {};
  const classes = ['btn'];
  if (config.variant) classes.push(`btn-${config.variant}`);
  if (config.size) classes.push(`btn-${config.size}`);
  if (config.block) classes.push('btn-block');
  return el('button', {
    type: 'button',
    class: classes.join(' '),
    title: config.title,
    disabled: config.disabled,
    onClick: config.onClick
  }, [label]);
};

const field = (label, control, help) => el('label', { class: 'field' }, [
  el('span', { class: 'field-label', text: label }),
  control,
  help ? el('span', { class: 'field-help', text: help }) : null
]);

const selectControl = (options, value, onChange, extraClass) => {
  const node = el('select', { class: `select ${extraClass || ''}`.trim() }, options.map((item) => el('option', { value: item.value }, [item.label])));
  node.value = value === null || value === undefined ? '' : String(value);
  if (node.selectedIndex < 0 && node.options.length) node.selectedIndex = 0;
  if (onChange) node.addEventListener('change', () => onChange(node.value));
  return node;
};

const statusOptions = (statuses, allLabel) => [{ value: '', label: allLabel }].concat(statuses.map((status) => ({ value: status, label: humanize(status) })));

const card = (title, actions, body, subtitle) => el('section', { class: 'card' }, [
  title ? el('header', { class: 'card-head' }, [
    el('div', { class: 'card-head-text' }, [
      el('h2', { class: 'card-title', text: title }),
      subtitle ? el('p', { class: 'card-sub', text: subtitle }) : null
    ]),
    actions ? el('div', { class: 'card-actions' }, actions) : null
  ]) : null,
  el('div', { class: 'card-body' }, body)
]);

const tableFrame = (headers, bodyElement) => el('div', { class: 'table-wrap' }, [
  el('table', { class: 'data-table' }, [
    el('thead', {}, [el('tr', {}, headers.map((header) => el('th', { text: header })))]),
    bodyElement
  ])
]);

const emptyState = (message) => el('div', { class: 'empty', text: message });

const emptyRow = (columns, message) => el('tr', {}, [el('td', { colspan: String(columns), class: 'empty-cell', text: message })]);

const copyToClipboard = async (value) => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const holder = el('textarea', { class: 'clipboard-proxy', value });
  document.body.appendChild(holder);
  holder.select();
  document.execCommand('copy');
  holder.remove();
};

class ApiError extends Error {
  constructor(status, payload) {
    const body = payload && typeof payload === 'object' ? payload : {};
    super(body.message || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error || 'error';
    this.payload = body;
  }

  get issues() {
    return Array.isArray(this.payload.issues) ? this.payload.issues : [];
  }
}

class Session {
  constructor() {
    this.authRequired = false;
    this.scopes = [];
    this.fallbackToken = '';
  }

  get token() {
    try {
      return window.localStorage.getItem(TOKEN_STORAGE_KEY) || '';
    } catch {
      return this.fallbackToken;
    }
  }

  save(token) {
    this.fallbackToken = token;
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      this.fallbackToken = token;
    }
  }

  clear() {
    this.fallbackToken = '';
    this.scopes = [];
    try {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      this.fallbackToken = '';
    }
  }
}

class ApiClient {
  constructor(session) {
    this.session = session;
    this.unauthorizedHandler = null;
  }

  onUnauthorized(handler) {
    this.unauthorizedHandler = handler;
  }

  static query(params) {
    const search = new URLSearchParams();
    for (const key of Object.keys(params || {})) {
      const value = params[key];
      if (value === null || value === undefined || value === '') continue;
      search.set(key, String(value));
    }
    const encoded = search.toString();
    return encoded ? `?${encoded}` : '';
  }

  async request(method, path, body) {
    const endpoint = path.split('?')[0];
    const isPublic = PUBLIC_ENDPOINTS.has(endpoint);
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = this.session.token;
    if (token && !isPublic) headers['X-Api-Key'] = token;

    let response;
    try {
      response = await fetch(path, {
        method,
        headers,
        cache: 'no-store',
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new ApiError(0, { error: 'network_error', message: 'Network error: the server is unreachable.' });
    }

    const raw = await response.text();
    let payload = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const error = new ApiError(response.status, payload);
      if (response.status === 401 && !isPublic && this.unauthorizedHandler) this.unauthorizedHandler(error);
      throw error;
    }
    return payload || {};
  }

  get(path) {
    return this.request('GET', path);
  }

  post(path, body) {
    return this.request('POST', path, body === undefined ? {} : body);
  }

  put(path, body) {
    return this.request('PUT', path, body === undefined ? {} : body);
  }

  patch(path, body) {
    return this.request('PATCH', path, body === undefined ? {} : body);
  }

  del(path) {
    return this.request('DELETE', path);
  }
}

class ToastCenter {
  constructor(container) {
    this.container = container;
  }

  push(message, tone, timeoutMs) {
    const text = String(message === null || message === undefined ? '' : message);
    if (!text) return;
    const toast = el('div', { class: `toast toast-${tone || 'info'}` }, [
      el('span', { class: 'toast-text', text }),
      el('button', { class: 'toast-close', type: 'button', title: 'Dismiss' }, ['×'])
    ]);
    const dismiss = () => {
      toast.classList.add('toast-leaving');
      window.setTimeout(() => toast.remove(), 180);
    };
    toast.addEventListener('click', dismiss);
    this.container.appendChild(toast);
    window.setTimeout(dismiss, timeoutMs || 5200);
  }

  info(message) {
    this.push(message, 'info');
  }

  success(message) {
    this.push(message, 'success');
  }

  warn(message) {
    this.push(message, 'warn');
  }

  error(message) {
    this.push(message, 'error', 7000);
  }
}

class ConfirmDialog {
  constructor(root) {
    this.root = root;
    this.activeClose = null;
  }

  close() {
    if (this.activeClose) this.activeClose(null);
  }

  open(builder) {
    if (this.activeClose) this.activeClose(null);
    return new Promise((resolve) => {
      const finish = (result) => {
        document.removeEventListener('keydown', onKeydown);
        this.root.hidden = true;
        clear(this.root);
        this.activeClose = null;
        resolve(result);
      };
      const onKeydown = (event) => {
        if (event.key === 'Escape') finish(null);
      };
      this.activeClose = finish;
      const content = builder(finish);
      const backdrop = el('div', { class: 'modal-backdrop' }, [content]);
      backdrop.addEventListener('mousedown', (event) => {
        if (event.target === backdrop) finish(null);
      });
      clear(this.root);
      this.root.hidden = false;
      this.root.appendChild(backdrop);
      document.addEventListener('keydown', onKeydown);
      const focusable = content.querySelector('input, textarea, select, button');
      if (focusable) focusable.focus();
    });
  }

  async ask(options) {
    const config = options || {};
    const result = await this.open((finish) => el('div', { class: 'modal-card' }, [
      el('header', { class: 'modal-head' }, [el('h3', { class: 'modal-title', text: config.title || 'Are you sure?' })]),
      el('div', { class: 'modal-body' }, [el('p', { class: 'modal-text', text: config.message || '' })]),
      el('footer', { class: 'modal-foot' }, [
        button(config.cancelLabel || 'Cancel', { variant: 'ghost', onClick: () => finish(null) }),
        button(config.confirmLabel || 'Confirm', { variant: config.danger ? 'danger' : 'primary', onClick: () => finish(true) })
      ])
    ]));
    return result === true;
  }

  form(options) {
    const config = options || {};
    const specs = config.fields || [];
    return this.open((finish) => {
      const controls = new Map();
      const rows = specs.map((spec) => {
        const control = spec.type === 'textarea'
          ? el('textarea', { class: 'textarea', rows: '3', placeholder: spec.placeholder || '', value: spec.value || '' })
          : el('input', { class: 'input', type: spec.type || 'text', placeholder: spec.placeholder || '', value: spec.value || '' });
        controls.set(spec.key, control);
        return field(spec.label, control, spec.help);
      });
      const submit = () => {
        const values = {};
        for (const [key, control] of controls) values[key] = control.value;
        finish(values);
      };
      const form = el('form', { class: 'modal-card' }, [
        el('header', { class: 'modal-head' }, [el('h3', { class: 'modal-title', text: config.title || 'Details' })]),
        el('div', { class: 'modal-body' }, [
          config.description ? el('p', { class: 'modal-text', text: config.description }) : null,
          el('div', { class: 'form-grid' }, rows)
        ]),
        el('footer', { class: 'modal-foot' }, [
          button('Cancel', { variant: 'ghost', onClick: () => finish(null) }),
          el('button', { class: 'btn btn-primary', type: 'submit' }, [config.submitLabel || 'Submit'])
        ])
      ]);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        submit();
      });
      return form;
    });
  }
}

class View {
  constructor(app) {
    this.app = app;
    this.api = app.api;
    this.toasts = app.toasts;
    this.dialog = app.dialog;
    this.element = el('section', { class: 'view' });
    this.timers = new Set();
    this.timersActive = false;
    this.destroyed = false;
  }

  async load() {}

  addTimer(intervalMs, task) {
    const timer = { intervalMs, task, handle: null };
    this.timers.add(timer);
    if (this.timersActive) this.startTimer(timer);
    return {
      stop: () => {
        this.stopTimer(timer);
        this.timers.delete(timer);
      }
    };
  }

  startTimer(timer) {
    if (timer.handle === null) timer.handle = window.setInterval(timer.task, timer.intervalMs);
  }

  stopTimer(timer) {
    if (timer.handle !== null) {
      window.clearInterval(timer.handle);
      timer.handle = null;
    }
  }

  resumeTimers() {
    this.timersActive = true;
    for (const timer of this.timers) this.startTimer(timer);
  }

  pauseTimers() {
    this.timersActive = false;
    for (const timer of this.timers) this.stopTimer(timer);
  }

  report(error) {
    if (error instanceof ApiError && error.status === 401) return;
    this.toasts.error(error && error.message ? error.message : 'Unexpected error');
  }

  async run(task) {
    try {
      await task();
    } catch (error) {
      this.report(error);
    }
  }

  destroy() {
    this.destroyed = true;
    this.pauseTimers();
    this.timers.clear();
    this.element.remove();
  }
}

class LogsPanel {
  constructor(app) {
    this.app = app;
    this.level = '';
    this.limit = 200;
    this.autoRefresh = true;
    this.list = el('div', { class: 'logs' });
    this.levelSelect = selectControl(statusOptions(LOG_LEVELS, 'All levels'), '', (value) => {
      this.level = value;
      this.refresh();
    });
    this.autoToggle = el('input', { class: 'checkbox', type: 'checkbox', checked: true });
    this.autoToggle.addEventListener('change', () => {
      this.autoRefresh = this.autoToggle.checked;
    });
    this.element = card('Activity log', [
      this.levelSelect,
      el('label', { class: 'inline-check' }, [this.autoToggle, el('span', { text: 'Auto refresh' })]),
      button('Refresh', { size: 'sm', variant: 'ghost', onClick: () => this.refresh() })
    ], [this.list], 'Most recent events reported by the automation engine.');
    setChildren(this.list, [emptyState('No log entries yet.')]);
  }

  async refresh() {
    try {
      const data = await this.app.api.get(`/api/logs${ApiClient.query({ level: this.level, limit: this.limit })}`);
      this.render(data.logs || []);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) setChildren(this.list, [emptyState(error.message)]);
    }
  }

  tick() {
    if (this.autoRefresh) this.refresh();
  }

  render(logs) {
    if (!logs.length) {
      setChildren(this.list, [emptyState('No log entries for this level.')]);
      return;
    }
    setChildren(this.list, logs.map((entry) => {
      const context = entry.context === null || entry.context === undefined || entry.context === ''
        ? ''
        : (typeof entry.context === 'string' ? entry.context : JSON.stringify(entry.context));
      return el('div', { class: `log-row log-${String(entry.level || 'info').toLowerCase()}` }, [
        el('span', { class: 'log-time', text: formatClock(entry.ts) }),
        el('span', { class: 'log-level', text: String(entry.level || 'info').toUpperCase() }),
        el('span', { class: 'log-message', text: String(entry.message === null || entry.message === undefined ? '' : entry.message) }),
        context ? el('span', { class: 'log-context', title: context, text: truncate(context, 120) }) : null
      ]);
    }));
  }
}

class DashboardView extends View {
  constructor(app) {
    super(app);
    this.statsGrid = el('div', { class: 'stat-grid' });
    this.sessionList = el('div', { class: 'stack' });
    this.qrHost = el('div', { class: 'qr-host' });
    this.sessionNameInput = el('input', { class: 'input', type: 'text', placeholder: 'Session name (optional)' });
    this.logs = new LogsPanel(app);
    this.qrTimer = null;
    this.qrSessionId = '';

    setChildren(this.statsGrid, [emptyState('Loading statistics.')]);
    setChildren(this.sessionList, [emptyState('Loading sessions.')]);

    setChildren(this.element, [
      el('div', { class: 'page-head' }, [
        el('h1', { class: 'page-title', text: 'Dashboard' }),
        el('p', { class: 'page-sub', text: 'Live overview of contacts, runs and WhatsApp connectivity.' })
      ]),
      card('Overview', null, [this.statsGrid]),
      card('WhatsApp sessions', [
        this.sessionNameInput,
        button('New session', { variant: 'primary', onClick: () => this.createSession() })
      ], [this.sessionList, this.qrHost], 'Link a device to send messages. A session must be open before workflows can run.'),
      this.logs.element
    ]);

    this.addTimer(5000, () => {
      this.refreshStats();
      this.refreshSessions();
      this.logs.tick();
    });
  }

  async load() {
    await Promise.all([this.refreshStats(), this.refreshSessions(), this.logs.refresh()]);
  }

  async refreshStats() {
    try {
      const [stats, health] = await Promise.all([
        this.api.get('/api/stats'),
        this.api.get('/api/health').catch(() => null)
      ]);
      if (this.destroyed) return;
      this.renderStats(stats, health);
    } catch (error) {
      this.report(error);
    }
  }

  renderStats(stats, health) {
    const contacts = stats.contacts || {};
    const runs = stats.runs || {};
    const sessions = stats.sessions || {};
    const tiles = [
      { scope: 'Contacts', label: 'Total', value: contacts.total, tone: '' },
      { scope: 'Contacts', label: 'Pending', value: contacts.pending, tone: 'muted' },
      { scope: 'Contacts', label: 'Invited', value: contacts.invited, tone: 'blue' },
      { scope: 'Contacts', label: 'In group', value: contacts.in_group, tone: 'green' },
      { scope: 'Contacts', label: 'Failed', value: contacts.failed, tone: 'red' },
      { scope: 'Contacts', label: 'Invalid', value: contacts.invalid, tone: 'amber' },
      { scope: 'Runs', label: 'Active', value: runs.active, tone: 'blue' },
      { scope: 'Runs', label: 'Waiting', value: runs.waiting, tone: 'amber' },
      { scope: 'Runs', label: 'Done', value: runs.done, tone: 'green' },
      { scope: 'Runs', label: 'Failed', value: runs.failed, tone: 'red' },
      { scope: 'Sessions', label: 'Open', value: `${sessions.open === undefined ? 0 : sessions.open} / ${sessions.total === undefined ? 0 : sessions.total}`, tone: 'green' },
      { scope: 'Today', label: 'Actions sent', value: stats.actionsToday, tone: '' }
    ];
    if (health && health.uptimeSeconds !== undefined) {
      tiles.push({ scope: 'Server', label: 'Uptime', value: formatDuration(health.uptimeSeconds), tone: 'muted' });
    }
    setChildren(this.statsGrid, tiles.map((tile) => el('div', { class: 'stat' }, [
      el('span', { class: 'stat-scope', text: tile.scope }),
      el('span', { class: `stat-value ${tile.tone ? `stat-${tile.tone}` : ''}`.trim(), text: tile.value === undefined || tile.value === null ? '—' : String(tile.value) }),
      el('span', { class: 'stat-label', text: tile.label })
    ])));
  }

  async refreshSessions() {
    try {
      const sessions = await this.app.refreshSessions(true);
      if (this.destroyed) return;
      this.renderSessions(sessions);
    } catch (error) {
      this.report(error);
    }
  }

  renderSessions(sessions) {
    if (!sessions.length) {
      setChildren(this.sessionList, [emptyState('No WhatsApp session yet. Create one and scan the QR code with your phone.')]);
      return;
    }
    setChildren(this.sessionList, sessions.map((session) => el('div', { class: 'session-row' }, [
      el('div', { class: 'session-main' }, [
        statusPill(session.status),
        el('span', { class: 'session-id', text: session.label || session.id }),
        el('span', { class: 'session-meta', text: session.phone ? `+${String(session.phone).replace(/^\+/, '')}` : 'Not linked' }),
        session.startedAt ? el('span', { class: 'session-meta', text: `started ${formatRelative(session.startedAt)}` }) : null
      ]),
      session.lastError ? el('div', { class: 'session-error', title: String(session.lastError), text: truncate(session.lastError, 140) }) : null,
      el('div', { class: 'session-actions' }, [
        (session.status === 'qr' || session.hasQr) ? button('Show QR', { size: 'sm', variant: 'primary', onClick: () => this.openQr(session.id) }) : null,
        button('Delete', { size: 'sm', variant: 'danger', onClick: () => this.deleteSession(session.id) })
      ])
    ])));
  }

  createSession() {
    const name = this.sessionNameInput.value.trim();
    this.run(async () => {
      const result = await this.api.post('/api/sessions', name ? { id: name } : {});
      this.sessionNameInput.value = '';
      this.toasts.success(`Session "${result.id}" created. Waiting for the QR code.`);
      await this.refreshSessions();
      this.openQr(result.id);
    });
  }

  deleteSession(id) {
    this.run(async () => {
      const confirmed = await this.dialog.ask({
        title: 'Delete session',
        message: `Session "${id}" will be logged out and removed. Workflows using it will stop sending.`,
        confirmLabel: 'Delete session',
        danger: true
      });
      if (!confirmed) return;
      await this.api.del(`/api/sessions/${encodeURIComponent(id)}`);
      if (this.qrSessionId === id) this.closeQr();
      this.toasts.success('Session deleted.');
      await this.refreshSessions();
    });
  }

  openQr(id) {
    this.closeQr();
    this.qrSessionId = id;
    this.renderQr({ status: 'connecting', qr: null });
    this.pollQr();
    this.qrTimer = this.addTimer(2500, () => this.pollQr());
  }

  closeQr() {
    if (this.qrTimer) this.qrTimer.stop();
    this.qrTimer = null;
    this.qrSessionId = '';
    clear(this.qrHost);
  }

  async pollQr() {
    const id = this.qrSessionId;
    if (!id) return;
    try {
      const data = await this.api.get(`/api/sessions/${encodeURIComponent(id)}/qr`);
      if (this.destroyed || this.qrSessionId !== id) return;
      this.renderQr(data);
      if (data.status === 'open' && this.qrTimer) {
        this.qrTimer.stop();
        this.qrTimer = null;
        this.refreshSessions();
      }
    } catch (error) {
      if (this.qrSessionId !== id) return;
      this.closeQr();
      this.report(error);
    }
  }

  renderQr(data) {
    const status = data.status || 'connecting';
    const header = el('div', { class: 'qr-head' }, [
      el('h3', { class: 'qr-title', text: `Link device: ${this.qrSessionId}` }),
      statusPill(status),
      button('Close', { size: 'sm', variant: 'ghost', onClick: () => this.closeQr() })
    ]);

    if (status === 'open') {
      setChildren(this.qrHost, [el('div', { class: 'qr-panel qr-success' }, [
        header,
        el('p', { class: 'qr-done', text: 'Session connected. You can close this panel.' })
      ])]);
      return;
    }

    const hasImage = typeof data.qr === 'string' && data.qr.startsWith('data:image/');
    const imageArea = hasImage
      ? el('img', { class: 'qr-image', alt: 'WhatsApp linking QR code', src: data.qr })
      : el('div', { class: 'qr-placeholder', text: status === 'error' ? 'The session reported an error. Delete it and try again.' : 'Waiting for a QR code from WhatsApp.' });

    setChildren(this.qrHost, [el('div', { class: 'qr-panel' }, [
      header,
      el('div', { class: 'qr-body' }, [
        imageArea,
        el('ol', { class: 'qr-steps' }, [
          el('li', { text: 'Open WhatsApp on your phone.' }),
          el('li', { text: 'Go to Settings, then Linked devices.' }),
          el('li', { text: 'Tap "Link a device" and scan this code.' }),
          el('li', { text: 'The code refreshes automatically every few seconds.' })
        ])
      ])
    ])]);
  }
}

class IntegrationsView extends View {
  constructor(app) {
    super(app);
    this.controls = new Map();
    this.initial = {};
    this.secrets = {};
    this.formHost = el('div', { class: 'stack' });
    this.saveButton = button('Save settings', { variant: 'primary', onClick: () => this.save() });

    setChildren(this.formHost, [emptyState('Loading settings.')]);
    setChildren(this.element, [
      el('div', { class: 'page-head' }, [
        el('h1', { class: 'page-title', text: 'Integrations' }),
        el('p', { class: 'page-sub', text: 'Inbound channels, sending pace and defaults used by every workflow.' })
      ]),
      this.formHost,
      el('div', { class: 'sticky-actions' }, [
        this.saveButton,
        button('Reload', { variant: 'ghost', onClick: () => this.load() })
      ])
    ]);
  }

  get groups() {
    return [
      {
        title: 'Mail',
        help: 'IMAP mailbox polled for inbound leads. Leave the host empty to disable mail intake.',
        fields: [
          { key: 'mail_host', label: 'IMAP host', type: 'text', placeholder: 'imap.example.com' },
          { key: 'mail_port', label: 'IMAP port', type: 'number', placeholder: '993' },
          { key: 'mail_user', label: 'Mailbox user', type: 'text', placeholder: 'inbox@example.com' },
          { key: 'mail_password', label: 'Mailbox password', type: 'secret' },
          { key: 'mail_poll_seconds', label: 'Poll interval (seconds)', type: 'number', placeholder: '60' }
        ]
      },
      {
        title: 'Telegram',
        help: 'A Telegram bot can forward messages into your workflows. The token is stored encrypted and never sent back to this page.',
        fields: [
          { key: 'telegram_bot_token', label: 'Bot token', type: 'secret' },
          { key: 'telegram_poll_seconds', label: 'Poll interval (seconds)', type: 'number', placeholder: '10' }
        ]
      },
      {
        title: 'Pacing and safety',
        help: 'Random delay between two actions and the hard cap per session per day. Higher values look more human and reduce the risk of a ban.',
        fields: [
          { key: 'pacing_min_seconds', label: 'Minimum delay (seconds)', type: 'number', placeholder: '20' },
          { key: 'pacing_max_seconds', label: 'Maximum delay (seconds)', type: 'number', placeholder: '90' },
          { key: 'daily_limit_per_session', label: 'Daily limit per session', type: 'number', placeholder: '150' }
        ]
      },
      {
        title: 'Defaults',
        help: 'Used by workflow nodes that do not define their own group or invite text.',
        fields: [
          { key: 'default_group_jid', label: 'Default group', type: 'group' },
          { key: 'default_invite_message', label: 'Default invite message', type: 'textarea', placeholder: 'Hello, here is your invite link.' }
        ]
      },
      {
        title: 'Data retention',
        help: 'Finished runs and log entries older than this are deleted automatically. Use 0 to keep everything.',
        fields: [
          { key: 'retention_days', label: 'Retention (days)', type: 'number', placeholder: '30' }
        ]
      }
    ];
  }

  async load() {
    await this.run(async () => {
      const [data] = await Promise.all([this.api.get('/api/settings'), this.app.refreshGroups(false)]);
      if (this.destroyed) return;
      this.initial = data.settings || {};
      this.secrets = data.secrets || {};
      this.render();
    });
  }

  render() {
    this.controls.clear();
    const sections = this.groups.map((group) => card(group.title, null, [
      el('div', { class: 'form-grid' }, group.fields.map((spec) => this.renderField(spec))),
      el('p', { class: 'group-help', text: group.help })
    ]));
    setChildren(this.formHost, sections);
  }

  renderField(spec) {
    const current = this.initial[spec.key] === undefined || this.initial[spec.key] === null ? '' : String(this.initial[spec.key]);

    if (spec.type === 'secret') {
      const stored = Boolean(this.secrets[spec.key]);
      const input = el('input', {
        class: 'input',
        type: 'password',
        autocomplete: 'new-password',
        placeholder: stored ? '•••••••• (stored)' : ''
      });
      const clearBox = el('input', { class: 'checkbox', type: 'checkbox' });
      clearBox.addEventListener('change', () => {
        input.disabled = clearBox.checked;
      });
      this.controls.set(spec.key, { kind: 'secret', input, clearBox });
      return el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: spec.label }),
        input,
        el('label', { class: 'inline-check' }, [clearBox, el('span', { text: 'Clear the stored value' })]),
        el('span', { class: 'field-help', text: stored ? 'A value is stored. Type a new one to replace it.' : 'No value stored yet.' })
      ]);
    }

    if (spec.type === 'group') {
      const control = this.app.buildGroupControl(current, 'No default group');
      this.controls.set(spec.key, { kind: 'plain', input: control });
      const state = this.app.groupsState;
      const help = state.ok
        ? 'Groups are read from the connected WhatsApp session.'
        : `Groups unavailable (${state.reason || 'unknown'}). The stored value is kept as free text.`;
      return el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: spec.label }),
        el('div', { class: 'field-row' }, [control, button('Refresh groups', { size: 'sm', variant: 'ghost', onClick: () => this.refreshGroups() })]),
        el('span', { class: 'field-help', text: help })
      ]);
    }

    const control = spec.type === 'textarea'
      ? el('textarea', { class: 'textarea', rows: '3', placeholder: spec.placeholder || '', value: current })
      : el('input', { class: 'input', type: spec.type === 'number' ? 'number' : 'text', placeholder: spec.placeholder || '', value: current });
    this.controls.set(spec.key, { kind: 'plain', input: control });
    return field(spec.label, control);
  }

  refreshGroups() {
    this.run(async () => {
      const state = await this.app.refreshGroups(true);
      if (state.ok) this.toasts.success(`Loaded ${state.groups.length} group(s).`);
      else this.toasts.warn(this.app.groupsHint(state.reason));
      this.initial = Object.assign({}, this.initial, this.snapshotPlainValues());
      this.render();
    });
  }

  snapshotPlainValues() {
    const values = {};
    for (const [key, control] of this.controls) {
      if (control.kind === 'secret') continue;
      values[key] = String(control.input.value === undefined || control.input.value === null ? '' : control.input.value);
    }
    return values;
  }

  collectChanges() {
    const payload = {};
    for (const [key, control] of this.controls) {
      if (control.kind === 'secret') {
        if (control.clearBox.checked) payload[key] = '';
        else if (control.input.value !== '') payload[key] = control.input.value;
        continue;
      }
      const value = String(control.input.value === undefined || control.input.value === null ? '' : control.input.value);
      const original = this.initial[key] === undefined || this.initial[key] === null ? '' : String(this.initial[key]);
      if (value !== original) payload[key] = value;
    }
    return payload;
  }

  save() {
    const payload = this.collectChanges();
    if (!Object.keys(payload).length) {
      this.toasts.info('Nothing to save.');
      return;
    }
    this.run(async () => {
      await this.api.put('/api/settings', payload);
      this.toasts.success('Settings saved.');
      await this.load();
    });
  }
}

class ContactsView extends View {
  constructor(app) {
    super(app);
    this.search = '';
    this.status = '';
    this.offset = 0;
    this.total = 0;
    this.contacts = [];
    this.selected = new Set();
    this.editingId = null;
    this.searchTimer = null;

    this.searchInput = el('input', { class: 'input', type: 'search', placeholder: 'Search phone or name' });
    this.searchInput.addEventListener('input', () => {
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        this.search = this.searchInput.value.trim();
        this.offset = 0;
        this.load();
      }, 300);
    });

    this.statusSelect = selectControl(statusOptions(CONTACT_STATUSES, 'All statuses'), '', (value) => {
      this.status = value;
      this.offset = 0;
      this.load();
    });

    this.pasteArea = el('textarea', {
      class: 'textarea',
      rows: '4',
      placeholder: 'Paste numbers, one per line or separated by commas. Optional format: +49123456789 Name'
    });
    this.pasteArea.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        this.addContacts();
      }
    });

    this.selectAllBox = el('input', { class: 'checkbox', type: 'checkbox' });
    this.selectAllBox.addEventListener('change', () => {
      if (this.selectAllBox.checked) this.contacts.forEach((contact) => this.selected.add(contact.id));
      else this.selected.clear();
      this.renderTable();
    });

    this.bulkButton = button('Delete selected', { variant: 'danger', size: 'sm', onClick: () => this.deleteSelected() });
    this.tableBody = el('tbody', {});
    this.pageInfo = el('span', { class: 'muted-text', text: '' });
    this.prevButton = button('Previous', { size: 'sm', variant: 'ghost', onClick: () => this.movePage(-1) });
    this.nextButton = button('Next', { size: 'sm', variant: 'ghost', onClick: () => this.movePage(1) });

    setChildren(this.element, [
      el('div', { class: 'page-head' }, [
        el('h1', { class: 'page-title', text: 'Contacts' }),
        el('p', { class: 'page-sub', text: 'The people your workflows can reach. Numbers are normalised on import.' })
      ]),
      card('Add contacts', [button('Add', { variant: 'primary', onClick: () => this.addContacts() })], [
        this.pasteArea,
        el('p', { class: 'group-help', text: 'Paste as many numbers as you like. Press Ctrl or Cmd with Enter to submit.' })
      ]),
      card('All contacts', [this.searchInput, this.statusSelect, this.bulkButton], [
        tableFrame(['', 'Phone', 'Name', 'Status', 'Source', 'Updated', 'Actions'], this.tableBody),
        el('div', { class: 'pagination' }, [this.prevButton, this.pageInfo, this.nextButton])
      ])
    ]);

    const headerRow = this.element.querySelector('thead tr');
    if (headerRow && headerRow.firstElementChild) setChildren(headerRow.firstElementChild, [this.selectAllBox]);
  }

  async load() {
    await this.run(async () => {
      const path = `/api/contacts${ApiClient.query({
        status: this.status,
        search: this.search,
        limit: CONTACTS_PAGE_SIZE,
        offset: this.offset
      })}`;
      const data = await this.api.get(path);
      if (this.destroyed) return;
      this.contacts = data.contacts || [];
      this.total = Number(data.total) || 0;
      this.renderTable();
    });
  }

  movePage(direction) {
    const next = this.offset + direction * CONTACTS_PAGE_SIZE;
    if (next < 0 || next >= Math.max(this.total, 1)) return;
    this.offset = next;
    this.selected.clear();
    this.load();
  }

  renderTable() {
    const visibleIds = new Set(this.contacts.map((contact) => contact.id));
    for (const id of Array.from(this.selected)) {
      if (!visibleIds.has(id)) this.selected.delete(id);
    }
    this.selectAllBox.checked = this.contacts.length > 0 && this.selected.size === this.contacts.length;
    this.bulkButton.disabled = this.selected.size === 0;
    this.bulkButton.textContent = this.selected.size ? `Delete selected (${this.selected.size})` : 'Delete selected';

    if (!this.contacts.length) {
      setChildren(this.tableBody, [emptyRow(7, this.search || this.status ? 'No contact matches this filter.' : 'No contacts yet. Paste some numbers above to get started.')]);
    } else {
      setChildren(this.tableBody, this.contacts.map((contact) => this.renderRow(contact)));
    }

    const from = this.total === 0 ? 0 : this.offset + 1;
    const to = Math.min(this.offset + this.contacts.length, this.total);
    this.pageInfo.textContent = `${from}–${to} of ${this.total}`;
    this.prevButton.disabled = this.offset === 0;
    this.nextButton.disabled = this.offset + CONTACTS_PAGE_SIZE >= this.total;
  }

  renderRow(contact) {
    const checkbox = el('input', { class: 'checkbox', type: 'checkbox', checked: this.selected.has(contact.id) });
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) this.selected.add(contact.id);
      else this.selected.delete(contact.id);
      this.selectAllBox.checked = this.selected.size === this.contacts.length;
      this.bulkButton.disabled = this.selected.size === 0;
      this.bulkButton.textContent = this.selected.size ? `Delete selected (${this.selected.size})` : 'Delete selected';
    });

    if (this.editingId === contact.id) {
      const nameInput = el('input', { class: 'input input-sm', type: 'text', value: contact.name || '', placeholder: 'Name' });
      const statusPicker = selectControl(CONTACT_STATUSES.map((status) => ({ value: status, label: humanize(status) })), contact.status);
      nameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') this.saveRow(contact, nameInput.value, statusPicker.value);
        if (event.key === 'Escape') {
          this.editingId = null;
          this.renderTable();
        }
      });
      return el('tr', { class: 'row-editing' }, [
        el('td', {}, [checkbox]),
        el('td', { class: 'mono', text: contact.phone || '' }),
        el('td', {}, [nameInput]),
        el('td', {}, [statusPicker]),
        el('td', { text: contact.source || '—' }),
        el('td', { text: formatRelative(contact.updatedAt) }),
        el('td', {}, [el('div', { class: 'row-actions' }, [
          button('Save', { size: 'sm', variant: 'primary', onClick: () => this.saveRow(contact, nameInput.value, statusPicker.value) }),
          button('Cancel', { size: 'sm', variant: 'ghost', onClick: () => { this.editingId = null; this.renderTable(); } })
        ])])
      ]);
    }

    return el('tr', {}, [
      el('td', {}, [checkbox]),
      el('td', { class: 'mono', text: contact.phone || '' }),
      el('td', { text: contact.name || '—' }),
      el('td', {}, [statusPill(contact.status)]),
      el('td', { text: contact.source || '—' }),
      el('td', { title: formatDateTime(contact.updatedAt), text: formatRelative(contact.updatedAt) }),
      el('td', {}, [el('div', { class: 'row-actions' }, [
        contact.lastError ? el('span', { class: 'inline-error', title: String(contact.lastError), text: 'error' }) : null,
        button('Edit', { size: 'sm', variant: 'ghost', onClick: () => { this.editingId = contact.id; this.renderTable(); } }),
        button('Delete', { size: 'sm', variant: 'danger', onClick: () => this.deleteContact(contact) })
      ])])
    ]);
  }

  addContacts() {
    const input = this.pasteArea.value.trim();
    if (!input) {
      this.toasts.warn('Paste at least one phone number first.');
      return;
    }
    this.run(async () => {
      const result = await this.api.post('/api/contacts', { input });
      this.pasteArea.value = '';
      this.toasts.success(`Parsed ${result.parsed === undefined ? 0 : result.parsed} number(s), added ${result.added === undefined ? 0 : result.added}.`);
      this.offset = 0;
      await this.load();
    });
  }

  saveRow(contact, name, status) {
    this.run(async () => {
      const payload = {};
      if (name !== (contact.name || '')) payload.name = name;
      if (status !== contact.status) payload.status = status;
      if (Object.keys(payload).length) await this.api.patch(`/api/contacts/${encodeURIComponent(contact.id)}`, payload);
      this.editingId = null;
      await this.load();
    });
  }

  deleteContact(contact) {
    this.run(async () => {
      const confirmed = await this.dialog.ask({
        title: 'Delete contact',
        message: `${contact.phone} will be removed permanently.`,
        confirmLabel: 'Delete',
        danger: true
      });
      if (!confirmed) return;
      await this.api.del(`/api/contacts/${encodeURIComponent(contact.id)}`);
      this.toasts.success('Contact deleted.');
      await this.load();
    });
  }

  deleteSelected() {
    const ids = Array.from(this.selected);
    if (!ids.length) return;
    this.run(async () => {
      const confirmed = await this.dialog.ask({
        title: 'Delete contacts',
        message: `${ids.length} contact(s) will be removed permanently.`,
        confirmLabel: 'Delete all',
        danger: true
      });
      if (!confirmed) return;
      const result = await this.api.post('/api/contacts/bulk-delete', { ids });
      this.selected.clear();
      this.toasts.success(`Deleted ${result.deleted === undefined ? ids.length : result.deleted} contact(s).`);
      await this.load();
    });
  }
}

class WorkflowCanvas {
  constructor(options) {
    this.getCatalog = options.getCatalog;
    this.getGroups = options.getGroups;
    this.onChange = options.onChange || (() => {});
    this.onSelect = options.onSelect || (() => {});
    this.notify = options.notify || (() => {});
    this.graph = { nodes: [], edges: [] };
    this.nodeViews = new Map();
    this.edgeViews = [];
    this.selectedId = null;
    this.pending = null;

    const holder = document.createElement('template');
    holder.innerHTML = '<svg class="edge-layer"><g class="edge"><path class="edge-hit"></path><path class="edge-line"></path></g></svg>';
    this.edgeLayer = holder.content.firstElementChild;
    this.edgePrototype = this.edgeLayer.firstElementChild;
    this.edgePrototype.remove();

    this.surface = el('div', { class: 'canvas-surface' }, [this.edgeLayer]);
    this.element = el('div', { class: 'canvas-wrap' }, [this.surface]);

    this.surface.addEventListener('click', (event) => {
      if (event.target === this.surface || event.target === this.edgeLayer) {
        this.cancelPending();
        this.select(null);
      }
    });
    this.surface.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });
    this.surface.addEventListener('drop', (event) => {
      event.preventDefault();
      const type = event.dataTransfer ? event.dataTransfer.getData('text/plain') : '';
      if (!type) return;
      const rect = this.surface.getBoundingClientRect();
      this.addNode(type, event.clientX - rect.left - NODE_WIDTH / 2, event.clientY - rect.top - 24);
    });
  }

  setGraph(graph) {
    const source = graph && typeof graph === 'object' ? graph : {};
    this.graph = {
      nodes: (Array.isArray(source.nodes) ? source.nodes : []).map((node, index) => ({
        id: String(node.id || `n${index + 1}`),
        type: String(node.type || ''),
        params: node.params && typeof node.params === 'object' ? Object.assign({}, node.params) : {},
        x: Number.isFinite(Number(node.x)) ? Math.max(0, Number(node.x)) : 60 + (index % 4) * 260,
        y: Number.isFinite(Number(node.y)) ? Math.max(0, Number(node.y)) : 60 + Math.floor(index / 4) * 150
      })),
      edges: (Array.isArray(source.edges) ? source.edges : []).map((edge) => ({
        from: String(edge.from || ''),
        to: String(edge.to || ''),
        out: String(edge.out || 'default')
      }))
    };
    this.selectedId = null;
    this.render();
  }

  serialize() {
    return {
      nodes: this.graph.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        params: Object.assign({}, node.params),
        x: Math.round(node.x),
        y: Math.round(node.y)
      })),
      edges: this.graph.edges.map((edge) => ({ from: edge.from, to: edge.to, out: edge.out }))
    };
  }

  definitionFor(type) {
    const catalog = this.getCatalog();
    if (!catalog) return null;
    return (catalog.nodes || []).find((definition) => definition.type === type) || null;
  }

  outputsFor(definition) {
    if (definition && Array.isArray(definition.outputs) && definition.outputs.length) return definition.outputs;
    return ['default'];
  }

  subtitleFor(node, definition) {
    if (!definition) return 'This node type is not in the catalog.';
    const fields = Array.isArray(definition.fields) ? definition.fields : [];
    for (const spec of fields) {
      const value = node.params[spec.key];
      if (value === undefined || value === null || value === '') continue;
      if (spec.type === 'group') {
        const match = this.getGroups().find((group) => group.jid === value);
        return match ? match.subject : String(value);
      }
      if (spec.type === 'checkbox') return `${spec.label}: ${value === 'true' ? 'yes' : 'no'}`;
      if (spec.type === 'password') return `${spec.label}: set`;
      return truncate(String(value).replace(/\s+/g, ' '), 52);
    }
    return definition.description || definition.label;
  }

  nextNodeId() {
    const used = new Set(this.graph.nodes.map((node) => node.id));
    let index = 1;
    while (used.has(`n${index}`)) index += 1;
    return `n${index}`;
  }

  freeSpot() {
    for (let row = 0; row < 40; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const x = 40 + column * 260;
        const y = 40 + row * 150;
        const taken = this.graph.nodes.some((node) => Math.abs(node.x - x) < 220 && Math.abs(node.y - y) < 120);
        if (!taken) return { x, y };
      }
    }
    return { x: 40, y: 40 };
  }

  addNode(type, x, y) {
    const definition = this.definitionFor(type);
    const params = {};
    if (definition) {
      for (const spec of definition.fields || []) {
        if (spec.default !== undefined && spec.default !== null) params[spec.key] = String(spec.default);
      }
    }
    const spot = x === undefined || y === undefined ? this.freeSpot() : { x: Math.max(0, x), y: Math.max(0, y) };
    const node = { id: this.nextNodeId(), type, params, x: spot.x, y: spot.y };
    this.graph.nodes.push(node);
    this.render();
    this.select(node.id);
    this.onChange();
    return node;
  }

  removeNode(id) {
    this.graph.nodes = this.graph.nodes.filter((node) => node.id !== id);
    this.graph.edges = this.graph.edges.filter((edge) => edge.from !== id && edge.to !== id);
    if (this.selectedId === id) this.selectedId = null;
    this.render();
    this.onSelect(this.selectedNode());
    this.onChange();
  }

  removeEdge(target) {
    this.graph.edges = this.graph.edges.filter((edge) => !(edge.from === target.from && edge.to === target.to && edge.out === target.out));
    this.render();
    this.onChange();
  }

  selectedNode() {
    return this.graph.nodes.find((node) => node.id === this.selectedId) || null;
  }

  select(id) {
    this.selectedId = id;
    for (const [nodeId, view] of this.nodeViews) view.card.classList.toggle('selected', nodeId === id);
    this.onSelect(this.selectedNode());
  }

  cancelPending() {
    if (!this.pending) return;
    const view = this.nodeViews.get(this.pending.from);
    if (view) {
      const port = view.outPorts.get(this.pending.out);
      if (port) port.classList.remove('armed');
    }
    this.pending = null;
  }

  beginConnection(nodeId, out) {
    this.cancelPending();
    this.pending = { from: nodeId, out };
    const view = this.nodeViews.get(nodeId);
    if (view) {
      const port = view.outPorts.get(out);
      if (port) port.classList.add('armed');
    }
    this.notify('Now click the input port of the target node. Click the background to cancel.');
  }

  completeConnection(targetId) {
    if (!this.pending) return;
    const source = this.pending;
    this.cancelPending();
    if (source.from === targetId) {
      this.notify('A node cannot connect to itself.', 'warn');
      return;
    }
    this.graph.edges = this.graph.edges.filter((edge) => !(edge.from === source.from && edge.out === source.out));
    this.graph.edges.push({ from: source.from, to: targetId, out: source.out });
    this.render();
    this.onChange();
  }

  render() {
    for (const view of this.nodeViews.values()) view.card.remove();
    this.nodeViews.clear();
    const known = new Set(this.graph.nodes.map((node) => node.id));
    this.graph.edges = this.graph.edges.filter((edge) => known.has(edge.from) && known.has(edge.to));
    for (const node of this.graph.nodes) {
      const view = this.buildNodeCard(node);
      this.nodeViews.set(node.id, view);
      this.surface.appendChild(view.card);
    }
    if (this.selectedId) this.select(this.selectedId);
    this.updateSurfaceSize();
    window.requestAnimationFrame(() => this.redrawEdges());
  }

  buildNodeCard(node) {
    const definition = this.definitionFor(node.type);
    const card = el('div', {
      class: `node${definition ? '' : ' node-unknown'}`,
      dataset: { id: node.id },
      style: { left: `${node.x}px`, top: `${node.y}px`, borderLeftColor: definition && definition.color ? definition.color : DEFAULT_NODE_COLOR }
    });

    const title = el('div', { class: 'node-title', text: definition ? definition.label : `Unknown node (${node.type})` });
    const subtitle = el('div', { class: 'node-sub', text: this.subtitleFor(node, definition) });
    const inPort = el('span', { class: 'port port-in', title: 'Input' });
    inPort.addEventListener('pointerdown', (event) => event.stopPropagation());
    inPort.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.pending) this.completeConnection(node.id);
      else this.notify('Start from an output port on the right of a node.');
    });

    const outPorts = new Map();
    const outputs = this.outputsFor(definition);
    const parts = [inPort, title, subtitle];

    if (outputs.length > 1) {
      const rows = outputs.map((name) => {
        const port = el('span', { class: `port port-out port-${name}`, title: `Output: ${name}` });
        this.wireOutputPort(port, node.id, name);
        outPorts.set(name, port);
        return el('div', { class: 'out-row' }, [el('span', { class: `out-tag out-tag-${name}`, text: name }), port]);
      });
      parts.push(el('div', { class: 'node-outs' }, rows));
    } else {
      const port = el('span', { class: 'port port-out port-single', title: 'Output' });
      this.wireOutputPort(port, node.id, outputs[0]);
      outPorts.set(outputs[0], port);
      parts.push(port);
    }

    setChildren(card, parts);
    this.wireNodeInteraction(card, node);
    return { card, subtitle, inPort, outPorts };
  }

  wireOutputPort(port, nodeId, out) {
    port.addEventListener('pointerdown', (event) => event.stopPropagation());
    port.addEventListener('click', (event) => {
      event.stopPropagation();
      this.beginConnection(nodeId, out);
    });
  }

  wireNodeInteraction(card, node) {
    card.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.requestNodeDelete(node);
    });

    card.addEventListener('pointerdown', (event) => {
      if (event.button === 2) return;
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = node.x;
      const originY = node.y;
      let dragging = false;
      let longPressFired = false;
      card.setPointerCapture(event.pointerId);

      const longPress = window.setTimeout(() => {
        longPressFired = true;
        this.requestNodeDelete(node);
      }, LONG_PRESS_MS);

      const move = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          dragging = true;
          window.clearTimeout(longPress);
          card.classList.add('dragging');
        }
        if (!dragging) return;
        node.x = Math.max(0, originX + dx);
        node.y = Math.max(0, originY + dy);
        card.style.left = `${node.x}px`;
        card.style.top = `${node.y}px`;
        this.redrawEdges();
      };

      const finish = () => {
        window.clearTimeout(longPress);
        card.removeEventListener('pointermove', move);
        card.classList.remove('dragging');
        if (dragging) {
          this.updateSurfaceSize();
          this.redrawEdges();
          this.onChange();
        } else if (!longPressFired) {
          this.select(node.id);
        }
      };

      card.addEventListener('pointermove', move);
      card.addEventListener('pointerup', finish, { once: true });
      card.addEventListener('pointercancel', finish, { once: true });
    });
  }

  requestNodeDelete(node) {
    const definition = this.definitionFor(node.type);
    const label = definition ? definition.label : node.type;
    if (!window.confirm(`Delete node "${label}" and its connections?`)) return;
    this.removeNode(node.id);
  }

  requestEdgeDelete(edge) {
    if (!window.confirm('Delete this connection?')) return;
    this.removeEdge(edge);
  }

  refreshNode(node) {
    const view = this.nodeViews.get(node.id);
    if (!view) return;
    view.subtitle.textContent = this.subtitleFor(node, this.definitionFor(node.type));
    this.redrawEdges();
  }

  updateSurfaceSize() {
    let maxX = 1200;
    let maxY = 700;
    for (const node of this.graph.nodes) {
      maxX = Math.max(maxX, node.x + NODE_WIDTH + 320);
      maxY = Math.max(maxY, node.y + 260);
    }
    this.surface.style.width = `${maxX}px`;
    this.surface.style.height = `${maxY}px`;
  }

  portCenter(portElement, cardElement) {
    let x = portElement.offsetWidth / 2;
    let y = portElement.offsetHeight / 2;
    let current = portElement;
    while (current && current !== cardElement) {
      x += current.offsetLeft;
      y += current.offsetTop;
      current = current.offsetParent;
    }
    return { x: cardElement.offsetLeft + x, y: cardElement.offsetTop + y };
  }

  redrawEdges() {
    for (const view of this.edgeViews) view.group.remove();
    this.edgeViews = [];
    for (const edge of this.graph.edges) {
      const fromView = this.nodeViews.get(edge.from);
      const toView = this.nodeViews.get(edge.to);
      if (!fromView || !toView) continue;
      const outPort = fromView.outPorts.get(edge.out) || fromView.outPorts.values().next().value;
      if (!outPort) continue;
      const start = this.portCenter(outPort, fromView.card);
      const end = this.portCenter(toView.inPort, toView.card);
      const curve = Math.min(160, Math.max(40, Math.abs(end.x - start.x) / 2));
      const path = `M ${start.x} ${start.y} C ${start.x + curve} ${start.y}, ${end.x - curve} ${end.y}, ${end.x} ${end.y}`;
      const group = this.edgePrototype.cloneNode(true);
      group.classList.add(`edge-${edge.out}`);
      const paths = group.querySelectorAll('path');
      paths[0].setAttribute('d', path);
      paths[1].setAttribute('d', path);
      group.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this.requestEdgeDelete(edge);
      });
      group.addEventListener('dblclick', () => this.requestEdgeDelete(edge));
      let pressTimer = null;
      group.addEventListener('pointerdown', () => {
        pressTimer = window.setTimeout(() => this.requestEdgeDelete(edge), LONG_PRESS_MS);
      });
      group.addEventListener('pointerup', () => window.clearTimeout(pressTimer));
      group.addEventListener('pointerleave', () => window.clearTimeout(pressTimer));
      this.edgeLayer.appendChild(group);
      this.edgeViews.push({ group, edge });
    }
  }
}

class NodeInspector {
  constructor(options) {
    this.getCatalog = options.getCatalog;
    this.buildGroupControl = options.buildGroupControl;
    this.buildSessionControl = options.buildSessionControl;
    this.onParamChange = options.onParamChange || (() => {});
    this.onDelete = options.onDelete || (() => {});
    this.node = null;
    this.dependents = [];
    this.body = el('div', { class: 'inspector-body' });
    this.element = el('aside', { class: 'inspector' }, [
      el('header', { class: 'pane-head' }, [el('h3', { class: 'pane-title', text: 'Inspector' })]),
      this.body
    ]);
    this.show(null);
  }

  catalog() {
    return this.getCatalog() || { nodes: [], triggers: [], categories: [] };
  }

  definitionFor(type) {
    return (this.catalog().nodes || []).find((definition) => definition.type === type) || null;
  }

  show(node) {
    this.node = node;
    this.render();
  }

  render() {
    this.dependents = [];
    if (!this.node) {
      setChildren(this.body, [emptyState('Select a node on the canvas to edit its settings.')]);
      return;
    }
    const node = this.node;
    const definition = this.definitionFor(node.type);
    const parts = [];

    parts.push(el('div', { class: 'inspector-head' }, [
      el('h4', { class: 'inspector-title', text: definition ? definition.label : `Unknown node (${node.type})` }),
      el('p', { class: 'inspector-desc', text: definition ? (definition.description || '') : 'This node type is not available in the catalog. It is kept as is until you delete it.' }),
      el('div', { class: 'inspector-meta' }, [
        el('span', { class: 'tag', text: `id ${node.id}` }),
        el('span', { class: 'tag', text: node.type }),
        definition && definition.scope ? el('span', { class: 'tag', text: `scope ${definition.scope}` }) : null
      ])
    ]));

    if (definition) {
      const fields = Array.isArray(definition.fields) ? definition.fields : [];
      for (const spec of fields) {
        parts.push(this.buildField(spec, true));
        if (spec.type === 'source') {
          const trigger = (this.catalog().triggers || []).find((item) => item.id === node.params[spec.key]);
          if (trigger) {
            parts.push(el('div', { class: 'inspector-section' }, [
              el('span', { class: 'section-title', text: trigger.label }),
              trigger.description ? el('span', { class: 'section-help', text: trigger.description }) : null,
              trigger.capabilities ? el('span', { class: 'section-help', text: `Commands: ${trigger.capabilities.commands ? 'yes' : 'no'} · Senders: ${trigger.capabilities.senders ? 'yes' : 'no'}` }) : null
            ]));
            for (const configSpec of trigger.configFields || []) parts.push(this.buildField(configSpec, false));
          }
        }
      }
      if (!fields.length) parts.push(emptyState('This node has no settings.'));
    }

    parts.push(el('div', { class: 'inspector-foot' }, [
      button('Delete node', { variant: 'danger', block: true, onClick: () => this.onDelete(node) })
    ]));

    setChildren(this.body, parts);
    this.applyDependencies();
  }

  applyDependencies() {
    for (const entry of this.dependents) {
      const current = this.node.params[entry.dependsOn.key];
      const allowed = Array.isArray(entry.dependsOn.in) ? entry.dependsOn.in.map((value) => String(value)) : [];
      entry.element.hidden = !allowed.includes(String(current === undefined || current === null ? '' : current));
    }
  }

  paramValue(spec) {
    const raw = this.node.params[spec.key];
    if (raw !== undefined && raw !== null) return String(raw);
    if (spec.default !== undefined && spec.default !== null) return String(spec.default);
    return '';
  }

  writeParam(spec, value, rerender) {
    this.node.params[spec.key] = String(value === undefined || value === null ? '' : value);
    this.onParamChange(this.node);
    if (rerender) this.render();
    else this.applyDependencies();
  }

  buildField(spec, isOwnField) {
    const wrapper = el('div', { class: `field${isOwnField ? '' : ' field-trigger'}` });
    const value = this.paramValue(spec);
    const label = el('span', { class: 'field-label', text: spec.label || spec.key });
    let control = null;

    if (spec.type === 'textarea') {
      control = el('textarea', { class: 'textarea', rows: '4', placeholder: spec.placeholder || '', value });
      control.addEventListener('input', () => this.writeParam(spec, control.value, false));
    } else if (spec.type === 'number') {
      control = el('input', { class: 'input', type: 'number', placeholder: spec.placeholder || '', value });
      control.addEventListener('input', () => this.writeParam(spec, control.value, false));
    } else if (spec.type === 'password') {
      control = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: spec.placeholder || '', value });
      control.addEventListener('input', () => this.writeParam(spec, control.value, false));
    } else if (spec.type === 'checkbox') {
      const box = el('input', { class: 'checkbox', type: 'checkbox', checked: value === 'true' });
      box.addEventListener('change', () => this.writeParam(spec, box.checked ? 'true' : 'false', false));
      control = el('label', { class: 'inline-check' }, [box, el('span', { text: spec.placeholder || 'Enabled' })]);
    } else if (spec.type === 'select') {
      const options = (spec.options || []).map((option) => ({ value: String(option.value), label: option.label }));
      if (!options.some((option) => option.value === value)) options.unshift({ value, label: value || 'Not set' });
      control = selectControl(options, value, (next) => this.writeParam(spec, next, false));
    } else if (spec.type === 'group') {
      control = this.buildGroupControl(value, 'Use default group');
      control.addEventListener('change', () => this.writeParam(spec, control.value, false));
      control.addEventListener('input', () => this.writeParam(spec, control.value, false));
    } else if (spec.type === 'session') {
      control = this.buildSessionControl(value);
      control.addEventListener('change', () => this.writeParam(spec, control.value, false));
    } else if (spec.type === 'source') {
      const triggers = (this.catalog().triggers || []).map((trigger) => ({ value: trigger.id, label: trigger.label }));
      control = selectControl([{ value: '', label: 'Select a source' }].concat(triggers), value, (next) => this.writeParam(spec, next, true));
    } else if (spec.type === 'keyvalue') {
      control = this.buildKeyValueEditor(spec, value);
    } else if (spec.type === 'buttons') {
      control = this.buildButtonsEditor(spec, value);
    } else {
      control = el('input', { class: 'input', type: 'text', placeholder: spec.placeholder || '', value });
      control.addEventListener('input', () => this.writeParam(spec, control.value, false));
    }

    setChildren(wrapper, [label, control, spec.help ? el('span', { class: 'field-help', text: spec.help }) : null]);
    if (spec.dependsOn && spec.dependsOn.key) this.dependents.push({ element: wrapper, dependsOn: spec.dependsOn });
    return wrapper;
  }

  buildKeyValueEditor(spec, value) {
    const entries = parseKeyValueParam(value);
    const list = el('div', { class: 'repeat-list' });
    const commit = () => {
      const result = {};
      for (const entry of entries) {
        if (!entry.key) continue;
        result[entry.key] = entry.value;
      }
      this.writeParam(spec, JSON.stringify(result), false);
    };
    const draw = () => {
      setChildren(list, entries.map((entry, index) => {
        const keyInput = el('input', { class: 'input input-sm', type: 'text', placeholder: 'key', value: entry.key });
        const valueInput = el('input', { class: 'input input-sm', type: 'text', placeholder: 'value', value: entry.value });
        keyInput.addEventListener('input', () => { entry.key = keyInput.value; commit(); });
        valueInput.addEventListener('input', () => { entry.value = valueInput.value; commit(); });
        return el('div', { class: 'repeat-row' }, [
          keyInput,
          valueInput,
          button('×', { size: 'sm', variant: 'ghost', title: 'Remove row', onClick: () => { entries.splice(index, 1); draw(); commit(); } })
        ]);
      }).concat([button('Add pair', { size: 'sm', variant: 'ghost', onClick: () => { entries.push({ key: '', value: '' }); draw(); } })]));
    };
    draw();
    return list;
  }

  buildButtonsEditor(spec, value) {
    const entries = parseButtonsParam(value);
    const list = el('div', { class: 'repeat-list' });
    const commit = () => {
      const lines = entries
        .filter((entry) => entry.label || entry.value)
        .map((entry) => `${entry.type} | ${entry.label} | ${entry.value}`);
      this.writeParam(spec, lines.join('\n'), false);
    };
    const draw = () => {
      setChildren(list, entries.map((entry, index) => {
        const typePicker = selectControl(BUTTON_TYPES.map((type) => ({ value: type, label: humanize(type) })), entry.type, (next) => { entry.type = next; commit(); }, 'select-sm');
        const labelInput = el('input', { class: 'input input-sm', type: 'text', placeholder: 'label', value: entry.label });
        const valueInput = el('input', { class: 'input input-sm', type: 'text', placeholder: 'value', value: entry.value });
        labelInput.addEventListener('input', () => { entry.label = labelInput.value; commit(); });
        valueInput.addEventListener('input', () => { entry.value = valueInput.value; commit(); });
        return el('div', { class: 'repeat-row repeat-row-wide' }, [
          typePicker,
          labelInput,
          valueInput,
          button('×', { size: 'sm', variant: 'ghost', title: 'Remove button', onClick: () => { entries.splice(index, 1); draw(); commit(); } })
        ]);
      }).concat([button('Add button', { size: 'sm', variant: 'ghost', onClick: () => { entries.push({ type: 'reply', label: '', value: '' }); draw(); } })]));
    };
    draw();
    return list;
  }
}

const parseKeyValueParam = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.keys(parsed).map((key) => ({ key, value: parsed[key] === null || parsed[key] === undefined ? '' : String(parsed[key]) }));
    }
  } catch {
    return [];
  }
  return [];
};

const parseButtonsParam = (raw) => String(raw || '')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .map((line) => {
    const parts = line.split('|').map((part) => part.trim());
    return {
      type: BUTTON_TYPES.includes(parts[0]) ? parts[0] : 'reply',
      label: parts[1] || '',
      value: parts[2] || ''
    };
  });

class WorkflowsView extends View {
  constructor(app) {
    super(app);
    this.workflows = [];
    this.current = null;
    this.dirty = false;

    this.listHost = el('div', { class: 'stack' });
    this.listPanel = el('div', { class: 'stack' }, [
      el('div', { class: 'page-head' }, [
        el('h1', { class: 'page-title', text: 'Workflows' }),
        el('p', { class: 'page-sub', text: 'Automations that react to inbound events and drive contacts through your funnel.' })
      ]),
      card('All workflows', [button('New workflow', { variant: 'primary', onClick: () => this.createWorkflow() })], [this.listHost])
    ]);
    this.editorPanel = el('div', { class: 'editor', hidden: true });
    setChildren(this.element, [this.listPanel, this.editorPanel]);
    setChildren(this.listHost, [emptyState('Loading workflows.')]);

    this.beforeUnload = (event) => {
      if (!this.dirty) return undefined;
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', this.beforeUnload);
  }

  destroy() {
    window.removeEventListener('beforeunload', this.beforeUnload);
    super.destroy();
  }

  async load() {
    if (this.current) return;
    await this.run(async () => {
      const data = await this.api.get('/api/workflows');
      if (this.destroyed) return;
      this.workflows = data.workflows || [];
      this.renderList();
    });
  }

  renderList() {
    if (!this.workflows.length) {
      setChildren(this.listHost, [emptyState('No workflow yet. Create one and drag nodes onto the canvas.')]);
      return;
    }
    setChildren(this.listHost, this.workflows.map((workflow) => {
      const stats = workflow.stats || {};
      return el('div', { class: 'workflow-row' }, [
        el('div', { class: 'workflow-main' }, [
          el('span', { class: 'workflow-name', text: workflow.name || `Workflow ${workflow.id}` }),
          el('span', { class: `pill ${workflow.enabled ? 'pill-green' : 'pill-muted'}`, text: workflow.enabled ? 'Enabled' : 'Disabled' }),
          el('span', { class: 'muted-text', text: `${workflow.nodeCount === undefined ? 0 : workflow.nodeCount} node(s)` }),
          el('span', { class: 'muted-text', text: `updated ${formatRelative(workflow.updatedAt)}` })
        ]),
        el('div', { class: 'workflow-stats' }, [
          el('span', { class: 'mini-stat mini-blue', text: `${stats.active || 0} active` }),
          el('span', { class: 'mini-stat mini-amber', text: `${stats.waiting || 0} waiting` }),
          el('span', { class: 'mini-stat mini-green', text: `${stats.done || 0} done` }),
          el('span', { class: 'mini-stat mini-red', text: `${stats.failed || 0} failed` })
        ]),
        el('div', { class: 'row-actions' }, [
          button('Edit', { size: 'sm', variant: 'primary', onClick: () => this.openEditor(workflow.id) }),
          button(workflow.enabled ? 'Disable' : 'Enable', { size: 'sm', variant: 'ghost', onClick: () => this.toggleWorkflow(workflow) }),
          button('Duplicate', { size: 'sm', variant: 'ghost', onClick: () => this.duplicateWorkflow(workflow) }),
          button('Delete', { size: 'sm', variant: 'danger', onClick: () => this.deleteWorkflow(workflow) })
        ])
      ]);
    }));
  }

  createWorkflow() {
    this.run(async () => {
      const values = await this.dialog.form({
        title: 'New workflow',
        description: 'Give the workflow a name. You can change it later in the editor.',
        submitLabel: 'Create',
        fields: [{ key: 'name', label: 'Name', placeholder: 'Invite new leads' }]
      });
      if (!values) return;
      const name = String(values.name || '').trim();
      if (!name) {
        this.toasts.warn('A name is required.');
        return;
      }
      const result = await this.api.post('/api/workflows', { name, graph: { nodes: [], edges: [] }, enabled: false });
      this.toasts.success('Workflow created.');
      await this.load();
      this.openEditor(result.id);
    });
  }

  toggleWorkflow(workflow) {
    this.run(async () => {
      await this.api.put(`/api/workflows/${encodeURIComponent(workflow.id)}`, { enabled: !workflow.enabled });
      this.toasts.success(workflow.enabled ? 'Workflow disabled.' : 'Workflow enabled.');
      await this.load();
    });
  }

  duplicateWorkflow(workflow) {
    this.run(async () => {
      await this.api.post(`/api/workflows/${encodeURIComponent(workflow.id)}/duplicate`);
      this.toasts.success('Workflow duplicated.');
      await this.load();
    });
  }

  deleteWorkflow(workflow) {
    this.run(async () => {
      const confirmed = await this.dialog.ask({
        title: 'Delete workflow',
        message: `"${workflow.name}" and its run history will be removed permanently.`,
        confirmLabel: 'Delete workflow',
        danger: true
      });
      if (!confirmed) return;
      await this.api.del(`/api/workflows/${encodeURIComponent(workflow.id)}`);
      this.toasts.success('Workflow deleted.');
      await this.load();
    });
  }

  openEditor(id) {
    this.run(async () => {
      const [data] = await Promise.all([
        this.api.get(`/api/workflows/${encodeURIComponent(id)}`),
        this.app.ensureCatalog(),
        this.app.refreshGroups(false),
        this.app.refreshSessions(false)
      ]);
      if (this.destroyed) return;
      this.current = data.workflow;
      this.dirty = false;
      this.buildEditor();
      this.listPanel.hidden = true;
      this.editorPanel.hidden = false;
      window.scrollTo(0, 0);
    });
  }

  closeEditor() {
    this.run(async () => {
      if (this.dirty) {
        const confirmed = await this.dialog.ask({
          title: 'Discard changes?',
          message: 'This workflow has unsaved changes. Close the editor and lose them?',
          confirmLabel: 'Discard',
          danger: true
        });
        if (!confirmed) return;
      }
      this.current = null;
      this.dirty = false;
      this.canvas = null;
      this.inspector = null;
      clear(this.editorPanel);
      this.editorPanel.hidden = true;
      this.listPanel.hidden = false;
      await this.load();
    });
  }

  markDirty() {
    this.dirty = true;
    if (this.saveButton) {
      this.saveButton.classList.add('is-dirty');
      this.saveButton.textContent = 'Save changes';
    }
  }

  markClean() {
    this.dirty = false;
    if (this.saveButton) {
      this.saveButton.classList.remove('is-dirty');
      this.saveButton.textContent = 'Saved';
      window.setTimeout(() => {
        if (!this.dirty && this.saveButton) this.saveButton.textContent = 'Save';
      }, 1500);
    }
  }

  buildEditor() {
    const workflow = this.current;
    this.nameInput = el('input', { class: 'input', type: 'text', value: workflow.name || '', placeholder: 'Workflow name' });
    this.descriptionInput = el('input', { class: 'input', type: 'text', value: workflow.description || '', placeholder: 'Short description' });
    this.enabledBox = el('input', { class: 'checkbox', type: 'checkbox', checked: Boolean(workflow.enabled) });
    this.nameInput.addEventListener('input', () => this.markDirty());
    this.descriptionInput.addEventListener('input', () => this.markDirty());
    this.enabledBox.addEventListener('change', () => this.markDirty());

    this.saveButton = button('Save', { variant: 'primary', onClick: () => this.save() });
    this.issuesBox = el('div', { class: 'issues', hidden: true });

    this.canvas = new WorkflowCanvas({
      getCatalog: () => this.app.catalog,
      getGroups: () => this.app.groupsState.groups,
      notify: (message, tone) => this.toasts.push(message, tone || 'info', 3200),
      onChange: () => this.markDirty(),
      onSelect: (node) => this.inspector.show(node)
    });

    this.inspector = new NodeInspector({
      getCatalog: () => this.app.catalog,
      buildGroupControl: (value, placeholder) => this.app.buildGroupControl(value, placeholder),
      buildSessionControl: (value) => this.app.buildSessionControl(value),
      onParamChange: (node) => {
        this.canvas.refreshNode(node);
        this.markDirty();
      },
      onDelete: (node) => {
        if (!window.confirm('Delete this node and its connections?')) return;
        this.canvas.removeNode(node.id);
      }
    });

    const palette = this.buildPalette();

    setChildren(this.editorPanel, [
      el('div', { class: 'editor-head' }, [
        el('div', { class: 'editor-meta' }, [
          this.nameInput,
          this.descriptionInput,
          el('label', { class: 'inline-check' }, [this.enabledBox, el('span', { text: 'Enabled' })])
        ]),
        el('div', { class: 'editor-actions' }, [
          this.saveButton,
          button('Test run', { variant: 'ghost', onClick: () => this.testRun() }),
          button('Close', { variant: 'ghost', onClick: () => this.closeEditor() })
        ])
      ]),
      this.issuesBox,
      el('div', { class: 'editor-panes' }, [palette, this.canvas.element, this.inspector.element])
    ]);

    this.canvas.setGraph(workflow.graph);
  }

  buildPalette() {
    const catalog = this.app.catalog || { nodes: [], categories: [] };
    const categories = (catalog.categories || []).slice();
    const seen = new Set(categories.map((category) => category.id));
    for (const definition of catalog.nodes || []) {
      if (!seen.has(definition.category)) {
        seen.add(definition.category);
        categories.push({ id: definition.category, label: humanize(definition.category) });
      }
    }
    const groups = categories.map((category) => {
      const items = (catalog.nodes || []).filter((definition) => definition.category === category.id);
      if (!items.length) return null;
      return el('div', { class: 'palette-group' }, [
        el('span', { class: 'palette-group-title', text: category.label }),
        el('div', { class: 'palette-items' }, items.map((definition) => {
          const item = el('div', {
            class: 'palette-item',
            draggable: 'true',
            title: definition.description || definition.label,
            style: { borderLeftColor: definition.color || DEFAULT_NODE_COLOR }
          }, [
            el('span', { class: 'palette-item-label', text: definition.label }),
            el('span', { class: 'palette-item-desc', text: truncate(definition.description || '', 60) })
          ]);
          item.addEventListener('click', () => this.canvas.addNode(definition.type));
          item.addEventListener('dragstart', (event) => {
            if (!event.dataTransfer) return;
            event.dataTransfer.setData('text/plain', definition.type);
            event.dataTransfer.effectAllowed = 'copy';
          });
          return item;
        }))
      ]);
    });

    return el('aside', { class: 'palette' }, [
      el('header', { class: 'pane-head' }, [el('h3', { class: 'pane-title', text: 'Nodes' })]),
      el('div', { class: 'palette-body' }, groups.filter(Boolean).length ? groups : [emptyState('The node catalog is empty.')])
    ]);
  }

  showIssues(issues) {
    if (!issues.length) {
      this.issuesBox.hidden = true;
      clear(this.issuesBox);
      return;
    }
    setChildren(this.issuesBox, [
      el('strong', { class: 'issues-title', text: 'This graph cannot be saved:' }),
      el('ul', { class: 'issues-list' }, issues.map((issue) => el('li', { text: String(issue) })))
    ]);
    this.issuesBox.hidden = false;
  }

  save() {
    const workflow = this.current;
    if (!workflow) return;
    const payload = {
      name: this.nameInput.value.trim() || 'Untitled workflow',
      description: this.descriptionInput.value,
      enabled: this.enabledBox.checked,
      graph: this.canvas.serialize()
    };
    this.run(async () => {
      try {
        await this.api.put(`/api/workflows/${encodeURIComponent(workflow.id)}`, payload);
      } catch (error) {
        if (error instanceof ApiError && error.status === 400) {
          const issues = error.issues.length ? error.issues : [error.message];
          this.showIssues(issues);
          this.toasts.error(error.message);
          return;
        }
        throw error;
      }
      this.showIssues([]);
      Object.assign(this.current, payload);
      this.markClean();
      this.toasts.success('Workflow saved.');
    });
  }

  testRun() {
    const workflow = this.current;
    if (!workflow) return;
    this.run(async () => {
      const values = await this.dialog.form({
        title: 'Test run',
        description: 'Simulate one inbound trigger event against this workflow.',
        submitLabel: 'Run test',
        fields: [
          { key: 'text', label: 'Message text', type: 'textarea', placeholder: 'hello' },
          { key: 'sender', label: 'Sender', placeholder: 'group or channel identifier' },
          { key: 'phone', label: 'Phone', placeholder: '+49123456789' },
          { key: 'name', label: 'Name', placeholder: 'Test contact' }
        ]
      });
      if (!values) return;
      const payload = {};
      for (const key of ['text', 'sender', 'phone', 'name']) {
        if (values[key]) payload[key] = values[key];
      }
      const result = await this.api.post(`/api/workflows/${encodeURIComponent(workflow.id)}/test`, payload);
      this.toasts.success(`Test accepted. Started ${result.runs === undefined ? 0 : result.runs} run(s).`);
    });
  }
}

class RunsView extends View {
  constructor(app) {
    super(app);
    this.workflowFilter = '';
    this.statusFilter = '';
    this.runs = [];
    this.workflowsLoaded = false;

    this.workflowSelect = selectControl([{ value: '', label: 'All workflows' }], '', (value) => {
      this.workflowFilter = value;
      this.load();
    });
    this.statusSelect = selectControl(statusOptions(RUN_STATUSES, 'All statuses'), '', (value) => {
      this.statusFilter = value;
      this.load();
    });
    this.clearSelect = selectControl(CLEARABLE_RUN_STATUSES.map((status) => ({ value: status, label: humanize(status) })), 'done');
    this.tableBody = el('tbody', {});

    setChildren(this.element, [
      el('div', { class: 'page-head' }, [
        el('h1', { class: 'page-title', text: 'Runs' }),
        el('p', { class: 'page-sub', text: 'Every contact currently moving through a workflow, and everything that already finished.' })
      ]),
      card('Run queue', [
        this.workflowSelect,
        this.statusSelect,
        button('Refresh', { size: 'sm', variant: 'ghost', onClick: () => this.load() }),
        this.clearSelect,
        button('Clear finished', { size: 'sm', variant: 'danger', onClick: () => this.clearRuns() })
      ], [
        tableFrame(['Status', 'Workflow', 'Contact', 'Current node', 'Attempts', 'Last error', 'Updated', 'Actions'], this.tableBody)
      ])
    ]);

    setChildren(this.tableBody, [emptyRow(8, 'Loading runs.')]);
    this.addTimer(8000, () => this.load());
  }

  async load() {
    await this.run(async () => {
      const [data, workflows] = await Promise.all([
        this.api.get(`/api/runs${ApiClient.query({ workflowId: this.workflowFilter, status: this.statusFilter, limit: 200 })}`),
        this.workflowsLoaded ? Promise.resolve(null) : this.api.get('/api/workflows')
      ]);
      if (this.destroyed) return;
      if (workflows) {
        this.workflowsLoaded = true;
        const options = [{ value: '', label: 'All workflows' }].concat((workflows.workflows || []).map((workflow) => ({
          value: String(workflow.id),
          label: workflow.name || `Workflow ${workflow.id}`
        })));
        setChildren(this.workflowSelect, options.map((option) => el('option', { value: option.value }, [option.label])));
        this.workflowSelect.value = this.workflowFilter;
      }
      this.runs = data.runs || [];
      this.renderTable();
    });
  }

  renderTable() {
    if (!this.runs.length) {
      setChildren(this.tableBody, [emptyRow(8, 'No run matches this filter.')]);
      return;
    }
    setChildren(this.tableBody, this.runs.map((run) => {
      const finished = run.status === 'done' || run.status === 'cancelled';
      const contact = [run.contactName, run.contactPhone].filter(Boolean).join(' · ');
      return el('tr', {}, [
        el('td', {}, [
          statusPill(run.status),
          run.resumeAt && run.status === 'waiting' ? el('div', { class: 'muted-text', text: `resumes ${formatRelative(run.resumeAt)}` }) : null
        ]),
        el('td', { text: run.workflowName || `#${run.workflowId}` }),
        el('td', { class: 'mono', text: contact || '—' }),
        el('td', { text: run.cursorNode || '—' }),
        el('td', { text: String(run.attempts === undefined ? 0 : run.attempts) }),
        el('td', { class: 'error-cell', title: run.lastError ? String(run.lastError) : '', text: run.lastError ? truncate(run.lastError, 60) : '—' }),
        el('td', { title: formatDateTime(run.updatedAt), text: formatRelative(run.updatedAt) }),
        el('td', {}, [el('div', { class: 'row-actions' }, [
          button('Retry', { size: 'sm', variant: 'ghost', disabled: finished, onClick: () => this.retry(run) }),
          button('Cancel', { size: 'sm', variant: 'danger', disabled: finished, onClick: () => this.cancel(run) })
        ])])
      ]);
    }));
  }

  retry(run) {
    this.run(async () => {
      await this.api.post(`/api/runs/${encodeURIComponent(run.id)}/retry`);
      this.toasts.success('Run queued for another attempt.');
      await this.load();
    });
  }

  cancel(run) {
    this.run(async () => {
      await this.api.post(`/api/runs/${encodeURIComponent(run.id)}/cancel`);
      this.toasts.success('Run cancelled.');
      await this.load();
    });
  }

  clearRuns() {
    const status = this.clearSelect.value;
    this.run(async () => {
      const confirmed = await this.dialog.ask({
        title: 'Clear runs',
        message: `All runs with status "${humanize(status)}" will be deleted.`,
        confirmLabel: 'Clear',
        danger: true
      });
      if (!confirmed) return;
      const result = await this.api.post('/api/runs/clear', { status });
      this.toasts.success(`Deleted ${result.deleted === undefined ? 0 : result.deleted} run(s).`);
      await this.load();
    });
  }
}

class ApiKeysView extends View {
  constructor(app) {
    super(app);
    this.keys = [];
    this.nameInput = el('input', { class: 'input', type: 'text', placeholder: 'Key name, for example "n8n webhook"' });
    this.scopeBoxes = new Map();
    for (const scope of KEY_SCOPES) {
      this.scopeBoxes.set(scope, el('input', { class: 'checkbox', type: 'checkbox', checked: scope === 'webhook' }));
    }
    this.revealHost = el('div', { class: 'reveal-host' });
    this.tableBody = el('tbody', {});

    setChildren(this.element, [
      el('div', { class: 'page-head' }, [
        el('h1', { class: 'page-title', text: 'API keys' }),
        el('p', { class: 'page-sub', text: 'Keys let other systems talk to this panel.' })
      ]),
      card('Create a key', [button('Create key', { variant: 'primary', onClick: () => this.createKey() })], [
        el('div', { class: 'form-grid' }, [
          field('Name', this.nameInput),
          el('div', { class: 'field' }, [
            el('span', { class: 'field-label', text: 'Scopes' }),
            el('div', { class: 'scope-list' }, KEY_SCOPES.map((scope) => el('label', { class: 'inline-check' }, [
              this.scopeBoxes.get(scope),
              el('span', { text: humanize(scope) })
            ])))
          ])
        ]),
        el('p', { class: 'group-help', text: 'A webhook key may only post trigger events to the hook endpoint for that key. An admin key can drive the whole API, including settings, contacts and workflows.' }),
        this.revealHost
      ]),
      card('Existing keys', [button('Refresh', { size: 'sm', variant: 'ghost', onClick: () => this.load() })], [
        tableFrame(['Name', 'Prefix', 'Scopes', 'Created', 'Last used', 'Status', 'Actions'], this.tableBody)
      ])
    ]);

    setChildren(this.tableBody, [emptyRow(7, 'Loading keys.')]);
  }

  async load() {
    await this.run(async () => {
      const data = await this.api.get('/api/keys');
      if (this.destroyed) return;
      this.keys = data.keys || [];
      this.renderTable();
    });
  }

  renderTable() {
    if (!this.keys.length) {
      setChildren(this.tableBody, [emptyRow(7, 'No API key yet.')]);
      return;
    }
    setChildren(this.tableBody, this.keys.map((key) => {
      const revoked = Boolean(key.revokedAt);
      return el('tr', { class: revoked ? 'row-muted' : '' }, [
        el('td', { text: key.name || '—' }),
        el('td', { class: 'mono', text: key.prefix || '—' }),
        el('td', {}, [el('div', { class: 'tag-row' }, (key.scopes || []).map((scope) => el('span', { class: 'tag', text: scope })))]),
        el('td', { title: formatDateTime(key.createdAt), text: formatRelative(key.createdAt) }),
        el('td', { title: formatDateTime(key.lastUsedAt), text: key.lastUsedAt ? formatRelative(key.lastUsedAt) : 'never' }),
        el('td', {}, [el('span', { class: `pill ${revoked ? 'pill-red' : 'pill-green'}`, text: revoked ? 'Revoked' : 'Active' })]),
        el('td', {}, [el('div', { class: 'row-actions' }, [
          button('Revoke', { size: 'sm', variant: 'danger', disabled: revoked, onClick: () => this.revokeKey(key) })
        ])])
      ]);
    }));
  }

  createKey() {
    const name = this.nameInput.value.trim();
    const scopes = KEY_SCOPES.filter((scope) => this.scopeBoxes.get(scope).checked);
    if (!name) {
      this.toasts.warn('Give the key a name first.');
      return;
    }
    if (!scopes.length) {
      this.toasts.warn('Select at least one scope.');
      return;
    }
    this.run(async () => {
      const result = await this.api.post('/api/keys', { name, scopes });
      this.nameInput.value = '';
      this.renderReveal(result);
      await this.load();
    });
  }

  renderReveal(result) {
    const plaintext = result.key || '';
    const webhookUrl = result.webhookUrl || '';
    const curl = `curl -X POST "${webhookUrl}" -H "Content-Type: application/json" -d '{"text":"hello","sender":"demo","phone":"+490000000000","name":"Demo"}'`;

    setChildren(this.revealHost, [el('div', { class: 'reveal' }, [
      el('strong', { class: 'reveal-title', text: 'Copy this key now. It is shown exactly once and can never be displayed again.' }),
      el('div', { class: 'reveal-row' }, [
        el('code', { class: 'code-block', text: plaintext }),
        button('Copy key', { size: 'sm', variant: 'primary', onClick: () => this.copy(plaintext, 'Key copied to the clipboard.') })
      ]),
      webhookUrl ? el('div', { class: 'reveal-row' }, [
        el('code', { class: 'code-block', text: webhookUrl }),
        button('Copy URL', { size: 'sm', variant: 'ghost', onClick: () => this.copy(webhookUrl, 'Webhook URL copied.') })
      ]) : null,
      webhookUrl ? el('div', { class: 'reveal-row' }, [
        el('code', { class: 'code-block code-wrap', text: curl }),
        button('Copy curl', { size: 'sm', variant: 'ghost', onClick: () => this.copy(curl, 'Sample command copied.') })
      ]) : null,
      el('p', { class: 'group-help', text: 'Send the key in the X-Api-Key header for API calls. Webhook keys post trigger events to their own hook URL.' }),
      button('Dismiss', { size: 'sm', variant: 'ghost', onClick: () => clear(this.revealHost) })
    ])]);
  }

  copy(value, message) {
    this.run(async () => {
      await copyToClipboard(value);
      this.toasts.success(message);
    });
  }

  revokeKey(key) {
    this.run(async () => {
      const confirmed = await this.dialog.ask({
        title: 'Revoke key',
        message: `"${key.name}" will stop working immediately for every system using it.`,
        confirmLabel: 'Revoke',
        danger: true
      });
      if (!confirmed) return;
      await this.api.del(`/api/keys/${encodeURIComponent(key.id)}`);
      this.toasts.success('Key revoked.');
      await this.load();
    });
  }
}

class Router {
  constructor(options) {
    this.routes = options.routes;
    this.outlet = options.outlet;
    this.fallback = options.fallback;
    this.onNavigate = options.onNavigate || (() => {});
    this.currentName = '';
    this.currentView = null;
  }

  start() {
    window.addEventListener('hashchange', () => this.apply());
    this.apply();
  }

  navigate(name) {
    window.location.hash = `#/${name}`;
  }

  resolve() {
    const raw = String(window.location.hash || '').replace(/^#/, '').replace(/^\/+/, '');
    return this.routes.has(raw) ? raw : this.fallback;
  }

  apply() {
    const name = this.resolve();
    if (name === this.currentName && this.currentView) return;
    this.destroyCurrent();
    this.currentName = name;
    const view = this.routes.get(name)();
    this.currentView = view;
    this.outlet.appendChild(view.element);
    if (!document.hidden) view.resumeTimers();
    view.load();
    this.onNavigate(name);
  }

  destroyCurrent() {
    if (!this.currentView) return;
    this.currentView.destroy();
    this.currentView = null;
    this.currentName = '';
  }
}

class App {
  constructor() {
    this.session = new Session();
    this.api = new ApiClient(this.session);
    this.toasts = new ToastCenter(document.getElementById('toastStack'));
    this.dialog = new ConfirmDialog(document.getElementById('modalRoot'));
    this.catalog = null;
    this.groupsState = { ok: false, groups: [], reason: 'not_loaded' };
    this.sessions = [];
    this.anyOpen = false;
    this.lastSessionsFetch = 0;
    this.headerTimer = null;
    this.routerStarted = false;

    this.dom = {
      boot: document.getElementById('bootScreen'),
      login: document.getElementById('loginScreen'),
      loginForm: document.getElementById('loginForm'),
      loginToken: document.getElementById('loginToken'),
      loginError: document.getElementById('loginError'),
      loginSubmit: document.getElementById('loginSubmit'),
      shell: document.getElementById('appShell'),
      tabs: document.getElementById('tabs'),
      viewRoot: document.getElementById('viewRoot'),
      connDot: document.getElementById('connDot'),
      version: document.getElementById('appVersion'),
      signOut: document.getElementById('signOutButton')
    };

    this.router = new Router({
      routes: new Map([
        ['dashboard', () => new DashboardView(this)],
        ['integrations', () => new IntegrationsView(this)],
        ['contacts', () => new ContactsView(this)],
        ['workflows', () => new WorkflowsView(this)],
        ['runs', () => new RunsView(this)],
        ['keys', () => new ApiKeysView(this)]
      ]),
      outlet: this.dom.viewRoot,
      fallback: 'dashboard',
      onNavigate: (name) => this.highlightTab(name)
    });

    this.api.onUnauthorized(() => this.handleUnauthorized());
    this.dom.loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitLogin();
    });
    this.dom.signOut.addEventListener('click', () => this.signOut());
    this.dom.tabs.addEventListener('click', (event) => {
      const target = event.target.closest('button[data-view]');
      if (target) this.router.navigate(target.dataset.view);
    });
    document.addEventListener('visibilitychange', () => this.applyVisibility());
  }

  async start() {
    try {
      const status = await this.api.get('/api/auth/status');
      this.session.authRequired = Boolean(status.authRequired);
      if (!this.session.authRequired) {
        this.enterApp();
        return;
      }
      const token = this.session.token;
      if (!token) {
        this.showLogin('');
        return;
      }
      try {
        const result = await this.api.request('POST', '/api/auth/login', { token });
        this.session.scopes = result.scopes || [];
        this.enterApp();
      } catch {
        this.session.clear();
        this.showLogin('Your stored token is no longer valid. Sign in again.');
      }
    } catch (error) {
      this.dom.boot.hidden = true;
      this.showLogin(error.message || 'The server did not answer.');
    }
  }

  showLogin(message) {
    this.dom.boot.hidden = true;
    this.dom.shell.hidden = true;
    this.dom.login.hidden = false;
    this.setLoginError(message);
    this.dom.loginToken.value = '';
    this.dom.loginToken.focus();
  }

  setLoginError(message) {
    this.dom.loginError.textContent = message || '';
    this.dom.loginError.hidden = !message;
  }

  async submitLogin() {
    const token = this.dom.loginToken.value.trim();
    if (!token) {
      this.setLoginError('Enter your access token.');
      return;
    }
    this.dom.loginSubmit.disabled = true;
    this.setLoginError('');
    try {
      const result = await this.api.request('POST', '/api/auth/login', { token });
      this.session.save(token);
      this.session.scopes = result.scopes || [];
      this.dom.login.hidden = true;
      this.enterApp();
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        const wait = Number(error.payload.retryAfterSeconds);
        this.setLoginError(Number.isFinite(wait) && wait > 0
          ? `Too many attempts. Try again in ${wait} second(s).`
          : (error.message || 'Too many attempts. Try again later.'));
      } else {
        this.setLoginError(error.message || 'Sign in failed.');
      }
    } finally {
      this.dom.loginSubmit.disabled = false;
    }
  }

  handleUnauthorized() {
    if (this.dom.login.hidden === false) return;
    this.session.clear();
    this.router.destroyCurrent();
    this.stopHeaderPolling();
    this.dom.shell.hidden = true;
    this.showLogin('Your session expired. Sign in again.');
  }

  signOut() {
    this.session.clear();
    window.location.reload();
  }

  enterApp() {
    this.dom.boot.hidden = true;
    this.dom.login.hidden = true;
    this.dom.shell.hidden = false;
    if (this.routerStarted) this.router.apply();
    else {
      this.routerStarted = true;
      this.router.start();
    }
    this.startHeaderPolling();
    this.refreshHealth();
    this.refreshSessions(true).catch(() => {});
  }

  highlightTab(name) {
    for (const tab of this.dom.tabs.querySelectorAll('button[data-view]')) {
      tab.classList.toggle('active', tab.dataset.view === name);
    }
  }

  startHeaderPolling() {
    this.stopHeaderPolling();
    this.headerTimer = window.setInterval(() => {
      this.refreshSessions(false).catch(() => {});
    }, 10000);
  }

  stopHeaderPolling() {
    if (this.headerTimer !== null) {
      window.clearInterval(this.headerTimer);
      this.headerTimer = null;
    }
  }

  applyVisibility() {
    const view = this.router.currentView;
    if (document.hidden) {
      this.stopHeaderPolling();
      if (view) view.pauseTimers();
      return;
    }
    if (this.dom.shell.hidden) return;
    this.startHeaderPolling();
    if (view) {
      view.resumeTimers();
      view.load();
    }
  }

  async refreshHealth() {
    try {
      const health = await this.api.get('/api/health');
      this.dom.version.textContent = health.version ? `v${health.version}` : '';
    } catch {
      this.dom.version.textContent = '';
    }
  }

  async refreshSessions(force) {
    const now = Date.now();
    if (!force && now - this.lastSessionsFetch < 3000) return this.sessions;
    this.lastSessionsFetch = now;
    const data = await this.api.get('/api/sessions');
    this.sessions = data.sessions || [];
    this.anyOpen = Boolean(data.anyOpen);
    this.updateConnectionDot();
    return this.sessions;
  }

  updateConnectionDot() {
    const openCount = this.sessions.filter((session) => session.status === 'open').length;
    this.dom.connDot.classList.toggle('is-online', this.anyOpen);
    this.dom.connDot.title = this.anyOpen
      ? `${openCount} WhatsApp session(s) connected`
      : 'No WhatsApp session connected';
  }

  async ensureCatalog() {
    if (this.catalog) return this.catalog;
    const data = await this.api.get('/api/catalog');
    this.catalog = {
      nodes: data.nodes || [],
      triggers: data.triggers || [],
      categories: data.categories || []
    };
    return this.catalog;
  }

  async refreshGroups(force) {
    if (!force && this.groupsState.reason !== 'not_loaded') return this.groupsState;
    try {
      const data = force
        ? await this.api.post('/api/groups/refresh')
        : await this.api.get('/api/groups');
      this.groupsState = {
        ok: Boolean(data.ok),
        groups: data.groups || [],
        reason: data.reason || (data.ok ? '' : 'unavailable')
      };
    } catch (error) {
      this.groupsState = { ok: false, groups: [], reason: error.code || 'unavailable' };
    }
    return this.groupsState;
  }

  groupsHint(reason) {
    if (reason === 'no_open_session') return 'No open WhatsApp session. Link a device on the dashboard, then load the groups again.';
    if (reason === 'not_loaded') return 'Groups have not been loaded yet.';
    return `Groups could not be loaded (${reason || 'unknown reason'}).`;
  }

  buildGroupControl(value, placeholderLabel) {
    const state = this.groupsState;
    if (!state.ok || !state.groups.length) {
      return el('input', {
        class: 'input',
        type: 'text',
        value: value || '',
        placeholder: 'Group identifier',
        title: this.groupsHint(state.reason)
      });
    }
    const options = [{ value: '', label: placeholderLabel || 'Use default group' }];
    for (const group of state.groups) {
      const admin = group.isAdmin ? '• admin' : '• not admin';
      const size = group.size === undefined || group.size === null ? '' : ` • ${group.size} members`;
      options.push({ value: group.jid, label: `${group.subject} ${admin}${size}` });
    }
    if (value && !state.groups.some((group) => group.jid === value)) {
      options.push({ value, label: `${value} (not in this session)` });
    }
    return selectControl(options, value || '');
  }

  buildSessionControl(value) {
    const options = [{ value: '', label: 'Any connected session' }];
    for (const session of this.sessions) {
      const phone = session.phone ? ` • ${session.phone}` : '';
      options.push({ value: session.id, label: `${session.label || session.id} • ${session.status}${phone}` });
    }
    if (value && !this.sessions.some((session) => session.id === value)) {
      options.push({ value, label: `${value} (missing)` });
    }
    return selectControl(options, value || '');
  }
}

new App().start();
