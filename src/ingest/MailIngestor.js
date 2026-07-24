import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { Ingestor } from './Ingestor.js';
import { clamp } from '#core/Support.js';

const MAX_MESSAGES_PER_CYCLE = 25;
const FIRST_RUN_BACKLOG = 10;

export class MailIngestor extends Ingestor {
  static source = 'mail';

  get pollIntervalMs() {
    return clamp(this.settings.number('mail_poll_seconds', 60), 15, 3600) * 1000;
  }

  isConfigured() {
    return Boolean(this.settings.get('mail_user') && this.settings.secret('mail_password'));
  }

  async collect() {
    if (!this.isConfigured()) return 0;

    const client = new ImapFlow({
      host: this.settings.get('mail_host') || 'imap.gmail.com',
      port: this.settings.number('mail_port', 993),
      secure: true,
      auth: { user: this.settings.get('mail_user'), pass: this.settings.secret('mail_password') },
      logger: false,
      emitLogs: false
    });

    let published = 0;
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uidValidity = String(client.mailbox.uidValidity ?? '0');
        const validityKey = this.stateKey('uidvalidity');
        const cursorKey = this.stateKey('uid');
        if (this.state.get(validityKey) !== uidValidity) {
          this.state.set(validityKey, uidValidity);
          this.state.set(cursorKey, '0');
        }

        let cursor = this.state.number(cursorKey, 0);
        if (cursor === 0) {
          const highest = Number(client.mailbox.uidNext ?? 1) - 1;
          cursor = Math.max(0, highest - FIRST_RUN_BACKLOG);
          this.state.set(cursorKey, String(cursor));
        }

        const candidates = (await client.search({ uid: `${cursor + 1}:*` }, { uid: true })) || [];
        const fresh = candidates.filter((uid) => uid > cursor).sort((left, right) => left - right).slice(0, MAX_MESSAGES_PER_CYCLE);
        if (fresh.length === 0) return 0;

        for await (const message of client.fetch({ uid: fresh }, { uid: true, source: true, envelope: true })) {
          const parsed = await simpleParser(message.source);
          const sender = (parsed.from?.value?.[0]?.address || '').toLowerCase();
          const body = [
            parsed.subject || '',
            parsed.text || '',
            parsed.html ? String(parsed.html).replace(/<[^>]+>/g, ' ') : ''
          ].join('\n');

          const stored = this.publish({
            externalId: `${uidValidity}:${message.uid}`,
            sender,
            chat: 'INBOX',
            name: parsed.from?.value?.[0]?.name || null,
            text: body,
            data: {
              subject: parsed.subject || '',
              from: sender,
              to: (parsed.to?.value || []).map((entry) => entry.address).join(','),
              messageId: parsed.messageId || null,
              receivedAt: parsed.date ? parsed.date.getTime() : Date.now()
            }
          });
          if (stored) published += 1;
          this.state.set(this.stateKey('uid'), String(message.uid));
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      this.logger.warn('Mail ingest failed.', { reason: error.message });
      return published;
    } finally {
      try {
        await client.logout();
      } catch {
        client.close();
      }
    }

    if (published > 0) this.logger.info(`Mail ingest captured ${published} message(s).`);
    return published;
  }
}
