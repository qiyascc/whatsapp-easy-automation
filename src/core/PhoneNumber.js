const MIN_DIGITS = 8;
const MIN_BARE_DIGITS = 10;
const MAX_DIGITS = 15;
const SEGMENT_SPLIT = /[\n\r,;|/\\\t]+/;
const SEPARATORS = new Set([' ', '.', '-', '(', ')', ' ']);
const MAX_SEPARATOR_RUN = 2;

export class PhoneNumber {
  static normalize(raw) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
    return digits;
  }

  static isValid(raw) {
    return PhoneNumber.normalize(raw) !== null;
  }

  static toJid(phone) {
    const digits = PhoneNumber.normalize(phone);
    return digits ? `${digits}@s.whatsapp.net` : null;
  }

  static fromJid(jid) {
    const local = String(jid ?? '').split('@')[0].split(':')[0];
    return PhoneNumber.normalize(local);
  }

  static isUserJid(jid) {
    return typeof jid === 'string' && /^\d{5,}@s\.whatsapp\.net$/.test(jid);
  }

  static extractAll(text, { allowBare = false } = {}) {
    const found = new Set();
    for (const segment of String(text ?? '').split(SEGMENT_SPLIT)) {
      for (const candidate of PhoneNumber.#scanSegment(segment, allowBare)) {
        found.add(candidate);
      }
    }
    return [...found];
  }

  static #scanSegment(segment, allowBare) {
    const direct = PhoneNumber.#scan(segment, allowBare);
    if (!direct.overflow) return direct.numbers;
    const perToken = [];
    for (const token of segment.split(/\s+/)) {
      perToken.push(...PhoneNumber.#scan(token, allowBare).numbers);
    }
    return perToken;
  }

  static #scan(input, allowBare) {
    const text = String(input ?? '');
    const numbers = [];
    let overflow = false;
    let index = 0;

    while (index < text.length) {
      const char = text[index];
      const explicit = char === '+';
      const bare = allowBare && PhoneNumber.#isDigit(char);
      if (!explicit && !bare) {
        index += 1;
        continue;
      }

      let cursor = explicit ? index + 1 : index;
      let digits = '';
      while (cursor < text.length) {
        const current = text[cursor];
        if (PhoneNumber.#isDigit(current)) {
          digits += current;
          cursor += 1;
          continue;
        }
        if (!SEPARATORS.has(current) || digits.length === 0) break;
        let lookahead = cursor;
        while (lookahead < text.length && SEPARATORS.has(text[lookahead])) lookahead += 1;
        const runLength = lookahead - cursor;
        if (runLength > MAX_SEPARATOR_RUN || lookahead >= text.length || !PhoneNumber.#isDigit(text[lookahead])) break;
        cursor = lookahead;
      }

      if (digits.length > MAX_DIGITS) overflow = true;
      const minimum = explicit ? MIN_DIGITS : MIN_BARE_DIGITS;
      if (digits.length >= minimum && digits.length <= MAX_DIGITS) numbers.push(digits);
      index = Math.max(cursor, index + 1);
    }

    return { numbers, overflow };
  }

  static #isDigit(char) {
    return char >= '0' && char <= '9';
  }
}
