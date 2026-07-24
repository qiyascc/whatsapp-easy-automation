import { PhoneNumber } from '#core/PhoneNumber.js';
import { ContactRepository } from '#db/repositories/ContactRepository.js';
import { NotFoundError, ValidationError } from '#core/AppError.js';
import { clamp } from '#core/Support.js';

const MAX_BULK_INPUT = 100000;

export class ContactService {
  constructor({ repository, logger }) {
    this.repository = repository;
    this.logger = logger;
  }

  addFromText(rawInput) {
    const input = String(rawInput ?? '').slice(0, MAX_BULK_INPUT);
    if (!input.trim()) throw new ValidationError('Paste at least one phone number.');
    const phones = PhoneNumber.extractAll(input, { allowBare: true });
    let added = 0;
    for (const phone of phones) {
      const { created } = this.repository.upsert({ phone, source: 'manual', status: 'pending' });
      if (created) added += 1;
    }
    if (added > 0) this.logger.info(`Added ${added} contact(s) by hand.`);
    return { added, parsed: phones.length };
  }

  list({ status, search, limit, offset }) {
    return this.repository.list({
      status: status ?? '',
      search: String(search ?? '').slice(0, 120),
      limit: clamp(Number.parseInt(limit ?? '50', 10) || 50, 1, 200),
      offset: Math.max(0, Number.parseInt(offset ?? '0', 10) || 0)
    });
  }

  update(id, { name, status }) {
    const contact = this.repository.findById(id);
    if (!contact) throw new NotFoundError('Contact');
    const patch = {};
    if (name !== undefined) patch.name = String(name).slice(0, 120) || null;
    if (status !== undefined) {
      if (!ContactRepository.statuses.includes(status)) throw new ValidationError('Unknown contact status.');
      patch.status = status;
    }
    this.repository.update(id, patch);
    return this.repository.findById(id);
  }

  remove(id) {
    if (!this.repository.delete(id)) throw new NotFoundError('Contact');
  }

  removeMany(ids) {
    const identifiers = (Array.isArray(ids) ? ids : [])
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value))
      .slice(0, 500);
    return this.repository.deleteMany(identifiers);
  }
}
