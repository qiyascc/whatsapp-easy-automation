import { Ingestor } from './Ingestor.js';
import { Channels } from '#core/EventBus.js';
import { PhoneNumber } from '#core/PhoneNumber.js';
import { truncate } from '#core/Support.js';

export class WhatsAppIngestor extends Ingestor {
  static source = 'whatsapp';

  constructor(dependencies) {
    super(dependencies);
    this.eventBus = dependencies.eventBus;
    this.contacts = dependencies.contacts;
  }

  get isPushBased() {
    return true;
  }

  attach() {
    return this.eventBus.on(Channels.WhatsAppMessage, (message) => this.#ingest(message));
  }

  #ingest(message) {
    if (message.pushName) {
      const known = this.contacts.findByPhone(message.sender);
      if (known && !known.name) this.contacts.update(known.id, { name: message.pushName });
    }
    this.publish({
      externalId: message.messageId,
      sender: message.sender,
      chat: message.chat,
      name: message.pushName,
      text: message.text,
      data: {
        sessionId: message.sessionId,
        isGroup: message.isGroup,
        chatJid: message.chat,
        timestamp: message.timestamp
      }
    });
  }
}

export class WebhookIngestor extends Ingestor {
  static source = 'webhook';

  get isPushBased() {
    return true;
  }

  accept({ keyId, keyName, keyPrefix, body, requestId }) {
    const text = WebhookIngestor.#extractText(body);
    const phones = WebhookIngestor.#extractPhones(body, text);
    const stored = this.publish({
      externalId: requestId,
      sender: String(body?.sender ?? body?.from ?? keyName ?? ''),
      chat: String(body?.channel ?? body?.chat ?? ''),
      name: body?.name ?? null,
      text,
      data: { keyId, keyName, keyPrefix, phones, body: body ?? {} }
    });
    return { accepted: stored, phones: phones.length };
  }

  static #extractText(body) {
    if (body === null || body === undefined) return '';
    if (typeof body === 'string') return body;
    if (typeof body.text === 'string') return body.text;
    if (typeof body.message === 'string') return body.message;
    if (typeof body.command === 'string') return body.command;
    try {
      return truncate(JSON.stringify(body), 4000);
    } catch {
      return '';
    }
  }

  static #extractPhones(body, text) {
    const collected = new Set();
    const push = (value) => {
      const normalized = PhoneNumber.normalize(value);
      if (normalized) collected.add(normalized);
    };
    if (body && typeof body === 'object') {
      push(body.phone);
      push(body.msisdn);
      if (Array.isArray(body.numbers)) {
        for (const entry of body.numbers) push(typeof entry === 'string' ? entry : entry?.phone);
      }
      if (Array.isArray(body.contacts)) {
        for (const entry of body.contacts) push(entry?.phone);
      }
    }
    for (const found of PhoneNumber.extractAll(text, { allowBare: false })) collected.add(found);
    return [...collected];
  }
}
