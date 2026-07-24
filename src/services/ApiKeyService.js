import { TokenHasher } from '../core/SecretVault.js';
import { ValidationError, NotFoundError } from '../core/AppError.js';

const KEY_PREFIX = 'wak_live_';
const VALID_SCOPES = Object.freeze(['admin', 'webhook']);

export class ApiKeyService {
  constructor({ repository, config, logger }) {
    this.repository = repository;
    this.config = config;
    this.logger = logger;
  }

  get authRequired() {
    return Boolean(this.config.adminToken) || this.repository.countActiveWithScope('admin') > 0;
  }

  issue({ name, scopes }) {
    const label = String(name ?? '').trim().slice(0, 80);
    if (!label) throw new ValidationError('The API key needs a name.');
    const requested = Array.isArray(scopes) ? scopes.filter((scope) => VALID_SCOPES.includes(scope)) : [];
    if (!requested.length) throw new ValidationError('Select at least one scope for the API key.');

    const secret = TokenHasher.generate(24);
    const key = `${KEY_PREFIX}${secret}`;
    const prefix = key.slice(0, KEY_PREFIX.length + 8);
    const id = this.repository.create({ name: label, prefix, tokenHash: TokenHasher.hash(key), scopes: requested });
    this.logger.info(`API key "${label}" was created with scopes ${requested.join(', ')}.`);
    return { id, key, prefix, scopes: requested };
  }

  list() {
    return this.repository.list();
  }

  revoke(id) {
    const changed = this.repository.revoke(id);
    if (!changed) throw new NotFoundError('API key');
    this.logger.info(`API key ${id} was revoked.`);
  }

  authenticate(rawToken) {
    const token = String(rawToken ?? '').trim();
    if (!token) return null;

    if (this.config.adminToken && TokenHasher.equals(token, this.config.adminToken)) {
      return { scopes: ['admin', 'webhook'], keyId: null, keyName: 'environment token', prefix: 'env' };
    }

    const record = this.repository.findByHash(TokenHasher.hash(token));
    if (!record) return null;
    this.repository.touch(record.id);
    return { scopes: record.scopes, keyId: record.id, keyName: record.name, prefix: record.prefix };
  }

  webhookUrlFor(key, host) {
    const base = this.config.publicBaseUrl || host || `http://${this.config.host}:${this.config.port}`;
    return `${base.replace(/\/+$/, '')}/api/hooks/${key}`;
  }

  static get scopes() {
    return VALID_SCOPES;
  }
}
