import { Ingestor } from './Ingestor.js';
import { clamp } from '#core/Support.js';

const API_BASE = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 20000;
const BATCH_LIMIT = 50;

export class TelegramIngestor extends Ingestor {
  static source = 'telegram';

  get pollIntervalMs() {
    return clamp(this.settings.number('telegram_poll_seconds', 10), 3, 600) * 1000;
  }

  isConfigured() {
    return Boolean(this.settings.secret('telegram_bot_token'));
  }

  async collect() {
    if (!this.isConfigured()) return 0;
    const token = this.settings.secret('telegram_bot_token');
    const offsetKey = this.stateKey('offset');
    const offset = this.state.number(offsetKey, 0);

    let payload;
    try {
      const response = await fetch(`${API_BASE}/bot${token}/getUpdates?offset=${offset}&limit=${BATCH_LIMIT}&timeout=0`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (!response.ok) {
        this.logger.warn(`Telegram API responded with status ${response.status}.`);
        return 0;
      }
      payload = await response.json();
    } catch (error) {
      this.logger.warn('Telegram ingest failed.', { reason: error.message });
      return 0;
    }

    if (!payload?.ok || !Array.isArray(payload.result) || payload.result.length === 0) return 0;

    let published = 0;
    let highestUpdateId = offset;
    for (const update of payload.result) {
      highestUpdateId = Math.max(highestUpdateId, Number(update.update_id) + 1);
      const message = update.message || update.edited_message || update.channel_post;
      if (!message) continue;
      const text = message.text || message.caption || '';
      if (!text) continue;
      const from = message.from || {};
      const sender = from.username ? `@${from.username}` : String(from.id ?? '');
      const stored = this.publish({
        externalId: String(update.update_id),
        sender,
        chat: String(message.chat?.id ?? ''),
        name: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || null,
        text,
        data: {
          chatId: message.chat?.id ?? null,
          chatType: message.chat?.type ?? null,
          userId: from.id ?? null,
          username: from.username ?? null,
          messageId: message.message_id ?? null
        }
      });
      if (stored) published += 1;
    }

    this.state.set(offsetKey, String(highestUpdateId));
    if (published > 0) this.logger.info(`Telegram ingest captured ${published} message(s).`);
    return published;
  }
}
