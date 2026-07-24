import { Template } from '#core/Template.js';
import { toBoolean } from '#core/Support.js';
import { PhoneNumber } from '#core/PhoneNumber.js';

export class NodeResult {
  constructor(kind, payload = {}) {
    this.kind = kind;
    Object.assign(this, payload);
  }

  static continue(output = 'default') {
    return new NodeResult('continue', { output });
  }

  static branch(value) {
    return new NodeResult('continue', { output: value ? 'true' : 'false' });
  }

  static wait(milliseconds) {
    return new NodeResult('wait', { milliseconds: Math.max(1000, Math.round(milliseconds)) });
  }

  static stop(reason = '') {
    return new NodeResult('stop', { reason });
  }

  static skip(reason = '') {
    return new NodeResult('skip', { reason, output: 'default' });
  }

  static fail(message) {
    return new NodeResult('fail', { message });
  }

  get isContinue() {
    return this.kind === 'continue';
  }

  get isSkip() {
    return this.kind === 'skip';
  }
}

export class WorkflowNode {
  static type = '';
  static category = 'action';
  static label = '';
  static description = '';
  static color = '#3b82f6';
  static scope = 'run';
  static outputs = ['default'];
  static fields = [];
  static costly = false;

  static describe() {
    return {
      type: this.type,
      category: this.category,
      label: this.label,
      description: this.description,
      color: this.color,
      scope: this.scope,
      outputs: this.outputs,
      fields: this.fields
    };
  }

  async execute() {
    return NodeResult.skip('This node has no behaviour.');
  }

  raw(context, key, fallback = '') {
    const value = context.params?.[key];
    return value === undefined || value === null || value === '' ? fallback : String(value);
  }

  text(context, key, fallback = '') {
    return Template.render(this.raw(context, key, fallback), context.scope);
  }

  flag(context, key, fallback = false) {
    return toBoolean(context.params?.[key], fallback);
  }

  integer(context, key, fallback) {
    const value = Number.parseInt(this.raw(context, key, ''), 10);
    return Number.isFinite(value) ? value : fallback;
  }

  groupJid(context) {
    return this.text(context, 'group_jid') || context.settings.default_group_jid || '';
  }

  async contactJid(context) {
    const contact = context.contact;
    if (!contact) return null;
    if (PhoneNumber.isUserJid(contact.jid)) return contact.jid;
    const resolved = await context.gateway.resolveJid(contact.phone);
    if (!resolved) {
      context.services.contacts.update(contact.id, { status: 'invalid', last_error: 'This number is not on WhatsApp.' });
      return null;
    }
    context.services.contacts.update(contact.id, { jid: resolved });
    return resolved;
  }

  rememberMessage(context, sent, jid) {
    if (!sent?.key) return;
    context.variables.lastMessageKey = sent.key;
    context.variables.lastMessageJid = jid;
  }
}
