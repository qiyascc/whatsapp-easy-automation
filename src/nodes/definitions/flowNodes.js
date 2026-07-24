import { WorkflowNode, NodeResult } from '../WorkflowNode.js';
import { clamp, randomInt, safeJsonParse, truncate } from '../../core/Support.js';
import { Template } from '../../core/Template.js';

const UNIT_MULTIPLIER = Object.freeze({ seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 });
const HTTP_TIMEOUT_MS = 15000;
const MAX_RESPONSE_CHARS = 20000;

export class WaitNode extends WorkflowNode {
  static type = 'wait';
  static category = 'flow';
  static color = '#f97316';
  static label = 'Wait';
  static description = 'Pauses this run for a while and resumes it afterwards. The run survives a restart of the app.';
  static fields = [
    { key: 'amount', label: 'Duration', type: 'number', default: '60' },
    {
      key: 'unit',
      label: 'Unit',
      type: 'select',
      default: 'minutes',
      options: [
        { value: 'seconds', label: 'seconds' },
        { value: 'minutes', label: 'minutes' },
        { value: 'hours', label: 'hours' },
        { value: 'days', label: 'days' }
      ]
    },
    { key: 'jitter_percent', label: 'Random jitter (%)', type: 'number', default: '0' }
  ];

  async execute(context) {
    const unit = UNIT_MULTIPLIER[this.raw(context, 'unit', 'minutes')] ?? UNIT_MULTIPLIER.minutes;
    const amount = clamp(this.integer(context, 'amount', 60), 1, 100000);
    const base = amount * unit;
    const jitter = clamp(this.integer(context, 'jitter_percent', 0), 0, 100);
    const spread = Math.round((base * jitter) / 100);
    return NodeResult.wait(spread > 0 ? randomInt(base - spread, base + spread) : base);
  }
}

export class StopNode extends WorkflowNode {
  static type = 'stop';
  static category = 'flow';
  static color = '#ef4444';
  static label = 'Stop';
  static description = 'Ends this run immediately.';
  static fields = [{ key: 'reason', label: 'Reason', type: 'text' }];

  async execute(context) {
    return NodeResult.stop(this.text(context, 'reason', 'Stopped by the flow.'));
  }
}

export class HttpRequestNode extends WorkflowNode {
  static type = 'http_request';
  static category = 'integration';
  static color = '#a855f7';
  static outputs = ['true', 'false'];
  static label = 'HTTP Request';
  static description = 'Calls an external API and stores the response. Branches on whether the request succeeded.';
  static fields = [
    {
      key: 'method',
      label: 'Method',
      type: 'select',
      default: 'GET',
      options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => ({ value: method, label: method }))
    },
    { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/contacts/{{phone}}' },
    { key: 'headers', label: 'Headers', type: 'keyvalue' },
    {
      key: 'body',
      label: 'Body',
      type: 'textarea',
      placeholder: '{"phone": "{{phone}}"}',
      dependsOn: { key: 'method', in: ['POST', 'PUT', 'PATCH', 'DELETE'] }
    },
    { key: 'save_as', label: 'Store the response as', type: 'text', default: 'response' }
  ];

  async execute(context) {
    const url = this.text(context, 'url');
    if (!/^https?:\/\//i.test(url)) return NodeResult.fail('The URL must start with http:// or https://.');

    const method = this.raw(context, 'method', 'GET').toUpperCase();
    const headers = { 'User-Agent': 'wa-automation/2.0' };
    for (const [key, value] of Object.entries(safeJsonParse(this.raw(context, 'headers'), {}))) {
      headers[String(key)] = Template.render(String(value), context.scope);
    }

    const init = { method, headers, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) };
    if (method !== 'GET' && method !== 'HEAD') {
      const body = this.text(context, 'body');
      if (body) {
        init.body = body;
        if (!Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }

    const slot = this.raw(context, 'save_as', 'response') || 'response';
    try {
      const response = await fetch(url, init);
      const raw = truncate(await response.text(), MAX_RESPONSE_CHARS);
      context.variables[slot] = {
        status: response.status,
        ok: response.ok,
        body: raw,
        json: safeJsonParse(raw, null)
      };
      return NodeResult.branch(response.ok);
    } catch (error) {
      context.variables[slot] = { status: 0, ok: false, body: '', json: null, error: error.message };
      return NodeResult.branch(false);
    }
  }
}
