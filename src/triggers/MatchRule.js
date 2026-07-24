import { toBoolean } from '#core/Support.js';

const MATCH_MODES = Object.freeze(['any', 'contains', 'equals', 'starts_with', 'regex', 'command']);

export class MatchRule {
  static get modes() {
    return MATCH_MODES;
  }

  static evaluate(event, config = {}) {
    const caseSensitive = toBoolean(config.case_sensitive, false);
    if (!MatchRule.#senderAllowed(event.sender, config.sender_filter)) {
      return { matched: false, command: '', args: '' };
    }

    const mode = MATCH_MODES.includes(config.match_mode) ? config.match_mode : 'any';
    const rawText = String(event.text ?? '');
    const needle = String(config.match_value ?? '');

    if (mode === 'any') return { matched: true, command: '', args: rawText.trim() };
    if (!needle) return { matched: true, command: '', args: rawText.trim() };

    const haystack = caseSensitive ? rawText : rawText.toLowerCase();
    const target = caseSensitive ? needle : needle.toLowerCase();

    if (mode === 'contains') return { matched: haystack.includes(target), command: '', args: rawText.trim() };
    if (mode === 'equals') return { matched: haystack.trim() === target.trim(), command: '', args: '' };
    if (mode === 'starts_with') {
      const matched = haystack.trimStart().startsWith(target);
      return { matched, command: '', args: matched ? rawText.trimStart().slice(needle.length).trim() : '' };
    }
    if (mode === 'regex') {
      try {
        const expression = new RegExp(needle, caseSensitive ? '' : 'i');
        const found = expression.exec(rawText);
        if (!found) return { matched: false, command: '', args: '' };
        return { matched: true, command: found[1] ?? '', args: found[2] ?? found[1] ?? rawText.trim(), groups: found.slice(1) };
      } catch {
        return { matched: false, command: '', args: '' };
      }
    }

    const tokens = rawText.trim().split(/\s+/);
    const first = caseSensitive ? tokens[0] ?? '' : (tokens[0] ?? '').toLowerCase();
    const expected = target.trim();
    if (first !== expected) return { matched: false, command: '', args: '' };
    return { matched: true, command: tokens[0] ?? '', args: tokens.slice(1).join(' ') };
  }

  static #senderAllowed(sender, filter) {
    const raw = String(filter ?? '').trim();
    if (!raw || raw === '*') return true;
    const candidate = MatchRule.#canonical(sender);
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .some((entry) => {
        if (entry === '*') return true;
        if (entry.includes('*')) {
          const pattern = new RegExp(`^${entry.replace(/[.*+?^${}()|[\]\\]/g, (match) => (match === '*' ? '.*' : `\\${match}`))}$`, 'i');
          return pattern.test(String(sender ?? ''));
        }
        const normalized = MatchRule.#canonical(entry);
        if (!normalized) return false;
        return candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate);
      });
  }

  static #canonical(value) {
    return String(value ?? '').trim().toLowerCase().replace(/^\+/, '');
  }
}
