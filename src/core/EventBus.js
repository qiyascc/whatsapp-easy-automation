import { EventEmitter } from 'node:events';

export class EventBus {
  #emitter = new EventEmitter();

  constructor(logger = null) {
    this.logger = logger;
    this.#emitter.setMaxListeners(50);
  }

  on(channel, handler) {
    const wrapped = (payload) => {
      try {
        const result = handler(payload);
        if (result && typeof result.catch === 'function') {
          result.catch((error) => this.#report(channel, error));
        }
      } catch (error) {
        this.#report(channel, error);
      }
    };
    this.#emitter.on(channel, wrapped);
    return () => this.#emitter.off(channel, wrapped);
  }

  once(channel, handler) {
    this.#emitter.once(channel, handler);
  }

  emit(channel, payload) {
    this.#emitter.emit(channel, payload);
  }

  removeAll() {
    this.#emitter.removeAllListeners();
  }

  #report(channel, error) {
    this.logger?.error(`Event handler failed on "${channel}"`, { message: error.message });
  }
}

export const Channels = Object.freeze({
  WhatsAppMessage: 'whatsapp.message',
  WhatsAppConnection: 'whatsapp.connection',
  TriggerEvent: 'trigger.event',
  RunFinished: 'run.finished'
});
