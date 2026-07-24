import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PREFIX = 'v1';
const ALGORITHM = 'aes-256-gcm';

export class SecretVault {
  #key;

  constructor(key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) {
      throw new Error('SecretVault requires a 32 byte key.');
    }
    this.#key = key;
  }

  static resolve({ masterSecret, keyFile }) {
    if (masterSecret) {
      return new SecretVault(crypto.createHash('sha256').update(masterSecret).digest());
    }
    fs.mkdirSync(path.dirname(keyFile), { recursive: true });
    if (fs.existsSync(keyFile)) {
      const stored = fs.readFileSync(keyFile, 'utf8').trim();
      const decoded = Buffer.from(stored, 'base64');
      if (decoded.length === 32) return new SecretVault(decoded);
    }
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, generated.toString('base64'), { mode: 0o600 });
    fs.chmodSync(keyFile, 0o600);
    return new SecretVault(generated);
  }

  encrypt(plaintext) {
    if (plaintext === null || plaintext === undefined || plaintext === '') return '';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, this.#key, iv);
    const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [PREFIX, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
  }

  decrypt(payload) {
    if (!payload) return '';
    const parts = String(payload).split(':');
    if (parts.length !== 4 || parts[0] !== PREFIX) return '';
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, this.#key, Buffer.from(parts[1], 'base64'));
      decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
    } catch {
      return '';
    }
  }
}

export class TokenHasher {
  static hash(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
  }

  static generate(bytes = 24) {
    return crypto.randomBytes(bytes).toString('base64url');
  }

  static equals(left, right) {
    const a = Buffer.from(String(left ?? ''), 'utf8');
    const b = Buffer.from(String(right ?? ''), 'utf8');
    if (a.length !== b.length) {
      crypto.timingSafeEqual(a, a);
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }
}
