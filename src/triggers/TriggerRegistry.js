export class TriggerSource {
  static id = 'unknown';
  static label = 'Unknown source';
  static description = '';
  static configFields = [];
  static capabilities = { commands: true, senders: true };

  static accepts() {
    return true;
  }

  static describe() {
    return {
      id: this.id,
      label: this.label,
      description: this.description,
      configFields: this.configFields,
      capabilities: this.capabilities
    };
  }
}

export class MailSource extends TriggerSource {
  static id = 'mail';
  static label = 'Email (IMAP)';
  static description = 'Fires for every message that arrives in the connected mailbox. Filter by sender address and by the subject or body content.';
  static configFields = [
    {
      key: 'subject_filter',
      label: 'Subject contains',
      type: 'text',
      placeholder: 'new signup',
      help: 'Optional. Only mail whose subject contains this text is considered.'
    }
  ];

  static accepts(event, config) {
    const filter = String(config.subject_filter ?? '').trim().toLowerCase();
    if (!filter) return true;
    return String(event.data?.subject ?? '').toLowerCase().includes(filter);
  }
}

export class WhatsAppSource extends TriggerSource {
  static id = 'whatsapp';
  static label = 'WhatsApp message';
  static description = 'Fires when your linked WhatsApp account receives a message. Restrict it to direct chats, to one group, or to specific senders.';
  static configFields = [
    {
      key: 'chat_scope',
      label: 'Listen to',
      type: 'select',
      default: 'direct',
      options: [
        { value: 'direct', label: 'Direct chats only' },
        { value: 'group', label: 'One specific group' },
        { value: 'any', label: 'Direct chats and groups' }
      ]
    },
    {
      key: 'group_jid',
      label: 'Group',
      type: 'group',
      dependsOn: { key: 'chat_scope', in: ['group'] }
    }
  ];

  static accepts(event, config) {
    const scope = config.chat_scope || 'direct';
    const isGroup = Boolean(event.data?.isGroup);
    if (scope === 'direct' && isGroup) return false;
    if (scope === 'group') {
      if (!isGroup) return false;
      const expected = String(config.group_jid ?? '').trim();
      if (expected && event.chat !== expected) return false;
    }
    return true;
  }
}

export class TelegramSource extends TriggerSource {
  static id = 'telegram';
  static label = 'Telegram bot';
  static description = 'Fires for every update your Telegram bot receives. Use commands such as /add to drive the flow.';
  static configFields = [
    {
      key: 'chat_id',
      label: 'Chat id',
      type: 'text',
      placeholder: '-1001234567890',
      help: 'Optional. Only updates from this chat are considered.'
    }
  ];

  static accepts(event, config) {
    const expected = String(config.chat_id ?? '').trim();
    if (!expected) return true;
    return String(event.chat ?? '') === expected;
  }
}

export class WebhookSource extends TriggerSource {
  static id = 'webhook';
  static label = 'Webhook (HTTP)';
  static description = 'Fires when an external system posts to /api/hooks/<api key>. The whole JSON body is available to the flow through {{payload.…}}.';
  static configFields = [
    {
      key: 'key_prefix',
      label: 'Restrict to API key prefix',
      type: 'text',
      placeholder: 'wak_live_ab12cd34',
      help: 'Optional. Only calls made with this API key prefix are considered.'
    }
  ];

  static capabilities = { commands: true, senders: false };

  static accepts(event, config) {
    const expected = String(config.key_prefix ?? '').trim();
    if (!expected) return true;
    return String(event.data?.keyPrefix ?? '').startsWith(expected);
  }
}

export class TriggerRegistry {
  #sources = new Map();

  constructor(sources = [MailSource, WhatsAppSource, TelegramSource, WebhookSource]) {
    for (const source of sources) this.#sources.set(source.id, source);
  }

  get(id) {
    return this.#sources.get(id) ?? null;
  }

  has(id) {
    return this.#sources.has(id);
  }

  ids() {
    return [...this.#sources.keys()];
  }

  describeAll() {
    return [...this.#sources.values()].map((source) => source.describe());
  }
}
