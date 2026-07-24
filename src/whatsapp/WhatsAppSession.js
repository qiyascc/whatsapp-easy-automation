import fs from 'node:fs';
import path from 'node:path';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import { Channels } from '../core/EventBus.js';
import { WhatsAppGateway } from './WhatsAppGateway.js';
import { clamp } from '../core/Support.js';

const SILENT_LOGGER = pino({ level: 'silent' });
const MAX_RECONNECT_ATTEMPTS = 8;
const BASE_RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 120000;

export class WhatsAppSession {
  #socket = null;
  #status = 'closed';
  #qrDataUrl = null;
  #reconnectAttempts = 0;
  #reconnectTimer = null;
  #disposed = false;
  #lastError = null;
  #startedAt = null;

  constructor({ id, directory, logger, eventBus }) {
    this.id = id;
    this.directory = directory;
    this.logger = logger;
    this.eventBus = eventBus;
    this.phone = null;
    this.label = null;
    this.gateway = null;
  }

  get status() {
    return this.#status;
  }

  get socket() {
    return this.#socket;
  }

  get isOpen() {
    return this.#status === 'open' && this.#socket !== null;
  }

  get qr() {
    return this.#qrDataUrl;
  }

  snapshot() {
    return {
      id: this.id,
      status: this.#status,
      phone: this.phone,
      label: this.label,
      hasQr: Boolean(this.#qrDataUrl),
      startedAt: this.#startedAt,
      lastError: this.#lastError
    };
  }

  hasCredentials() {
    return fs.existsSync(path.join(this.directory, 'creds.json'));
  }

  async start() {
    if (this.#disposed) return;
    if (this.#socket && (this.#status === 'open' || this.#status === 'connecting' || this.#status === 'qr')) return;

    fs.mkdirSync(this.directory, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(this.directory);
    const version = await this.#resolveVersion();

    this.#status = 'connecting';
    this.#startedAt = Date.now();
    this.#socket = makeWASocket({
      version,
      logger: SILENT_LOGGER,
      printQRInTerminal: false,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, SILENT_LOGGER) },
      browser: ['Chrome (Linux)', 'Chrome', '120.0.0'],
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: true
    });
    this.gateway = new WhatsAppGateway({ session: this, logger: this.logger });

    this.#socket.ev.on('creds.update', saveCreds);
    this.#socket.ev.on('messages.upsert', (batch) => this.#handleMessages(batch));
    this.#socket.ev.on('connection.update', (update) => this.#handleConnection(update));
  }

  async stop() {
    this.#clearReconnect();
    await this.#closeSocket();
    this.#status = 'closed';
  }

  async destroy() {
    this.#disposed = true;
    this.#clearReconnect();
    if (this.#socket) {
      try {
        await this.#socket.logout();
      } catch {
        this.logger.debug(`Session ${this.id} logout failed, closing anyway.`);
      }
    }
    await this.#closeSocket();
    this.#status = 'closed';
    fs.rmSync(this.directory, { recursive: true, force: true });
  }

  async #resolveVersion() {
    try {
      const { version } = await fetchLatestBaileysVersion();
      return version;
    } catch (error) {
      this.logger.warn('Could not fetch the latest WhatsApp protocol version, using the bundled one.', { reason: error.message });
      return undefined;
    }
  }

  async #closeSocket() {
    if (!this.#socket) return;
    const socket = this.#socket;
    this.#socket = null;
    this.gateway = null;
    try {
      socket.ev.removeAllListeners('connection.update');
      socket.ev.removeAllListeners('messages.upsert');
      socket.ev.removeAllListeners('creds.update');
      socket.end(undefined);
    } catch {
      this.logger.debug(`Session ${this.id} socket teardown raised an error.`);
    }
  }

  #clearReconnect() {
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
  }

  async #handleConnection(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.#status = 'qr';
      qrcodeTerminal.generate(qr, { small: true });
      this.logger.info(`Scan the QR code above to link session "${this.id}".`);
      try {
        this.#qrDataUrl = await qrcode.toDataURL(qr);
      } catch {
        this.#qrDataUrl = null;
      }
    }

    if (connection === 'open') {
      this.#status = 'open';
      this.#qrDataUrl = null;
      this.#reconnectAttempts = 0;
      this.#lastError = null;
      this.phone = String(this.#socket?.user?.id || '').split(':')[0].split('@')[0] || null;
      this.label = this.#socket?.user?.name || null;
      this.logger.info(`Session "${this.id}" is connected as ${this.phone ?? 'unknown'}.`);
      this.eventBus.emit(Channels.WhatsAppConnection, { sessionId: this.id, status: 'open', phone: this.phone });
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      this.#lastError = lastDisconnect?.error?.message || `closed with status ${statusCode ?? 'unknown'}`;
      await this.#closeSocket();
      this.eventBus.emit(Channels.WhatsAppConnection, { sessionId: this.id, status: 'closed', code: statusCode });

      if (this.#disposed) return;

      if (loggedOut) {
        this.#status = 'error';
        this.logger.warn(`Session "${this.id}" was logged out on the phone. Its credentials were removed.`);
        fs.rmSync(this.directory, { recursive: true, force: true });
        return;
      }

      if (this.#reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        this.#status = 'error';
        this.logger.error(`Session "${this.id}" gave up reconnecting after ${MAX_RECONNECT_ATTEMPTS} attempts.`);
        return;
      }

      this.#status = 'closed';
      this.#reconnectAttempts += 1;
      const delay = clamp(BASE_RECONNECT_DELAY_MS * 2 ** (this.#reconnectAttempts - 1), BASE_RECONNECT_DELAY_MS, MAX_RECONNECT_DELAY_MS);
      this.logger.warn(`Session "${this.id}" closed, retrying in ${Math.round(delay / 1000)}s.`, { attempt: this.#reconnectAttempts });
      this.#clearReconnect();
      this.#reconnectTimer = setTimeout(() => {
        this.start().catch((error) => this.logger.error(`Session "${this.id}" failed to restart.`, { reason: error.message }));
      }, delay);
      if (this.#reconnectTimer.unref) this.#reconnectTimer.unref();
    }
  }

  #handleMessages({ messages, type }) {
    if (type !== 'notify') return;
    for (const message of messages || []) {
      const normalized = WhatsAppSession.normalizeMessage(message, this.id);
      if (!normalized) continue;
      this.eventBus.emit(Channels.WhatsAppMessage, normalized);
    }
  }

  static normalizeMessage(message, sessionId) {
    const remoteJid = message?.key?.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') return null;
    if (message?.key?.fromMe) return null;

    const isGroup = remoteJid.endsWith('@g.us');
    const participant = message?.key?.participant || remoteJid;
    const senderPhone = String(participant).split('@')[0].split(':')[0];
    const content = message.message || {};
    const text =
      content.conversation ||
      content.extendedTextMessage?.text ||
      content.imageMessage?.caption ||
      content.videoMessage?.caption ||
      content.documentMessage?.caption ||
      content.buttonsResponseMessage?.selectedDisplayText ||
      content.templateButtonReplyMessage?.selectedDisplayText ||
      content.listResponseMessage?.title ||
      '';

    if (!text) return null;

    return {
      sessionId,
      messageId: message.key.id,
      chat: remoteJid,
      isGroup,
      sender: senderPhone,
      pushName: message.pushName || null,
      text: String(text),
      timestamp: Number(message.messageTimestamp || 0) * 1000 || Date.now()
    };
  }
}
