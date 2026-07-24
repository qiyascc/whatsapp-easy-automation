import { PhoneNumber } from '#core/PhoneNumber.js';
import { TtlCache } from '#core/Support.js';

const GROUP_LIST_TTL_MS = 45000;
const GROUP_META_TTL_MS = 20000;
const JID_TTL_MS = 300000;

export class WhatsAppGateway {
  #groupListCache = new TtlCache(GROUP_LIST_TTL_MS);
  #groupMetaCache = new TtlCache(GROUP_META_TTL_MS);
  #jidCache = new TtlCache(JID_TTL_MS);

  constructor({ session, logger }) {
    this.session = session;
    this.logger = logger;
  }

  get socket() {
    const socket = this.session.socket;
    if (!socket) throw new Error('The WhatsApp session is not connected.');
    return socket;
  }

  get selfPhone() {
    return this.session.phone;
  }

  invalidateGroups() {
    this.#groupListCache.clear();
    this.#groupMetaCache.clear();
  }

  async resolveJid(phone) {
    const digits = PhoneNumber.normalize(phone);
    if (!digits) return null;
    const cached = this.#jidCache.get(digits);
    if (cached !== undefined) return cached;

    const candidate = `${digits}@s.whatsapp.net`;
    try {
      const results = await this.socket.onWhatsApp(candidate);
      if (Array.isArray(results) && results.length === 0) return this.#jidCache.set(digits, null);
      const hit = Array.isArray(results) ? results.find((entry) => entry && entry.exists) : null;
      if (!hit) return this.#jidCache.set(digits, null);
      const jid = PhoneNumber.isUserJid(hit.jid) ? hit.jid : candidate;
      return this.#jidCache.set(digits, jid);
    } catch (error) {
      this.logger.debug('onWhatsApp lookup failed, falling back to the phone based jid.', { reason: error.message });
      return candidate;
    }
  }

  async listGroups({ force = false } = {}) {
    if (force) this.#groupListCache.clear();
    return this.#groupListCache.resolve('all', async () => {
      const participating = await this.socket.groupFetchAllParticipating();
      const selfPhone = this.selfPhone;
      const groups = Object.values(participating || {}).map((group) => ({
        jid: group.id,
        subject: group.subject || '(unnamed group)',
        size: (group.participants || []).length,
        isAdmin: (group.participants || []).some((participant) => {
          const phone = String(participant.id).split('@')[0].split(':')[0];
          return phone === selfPhone && (participant.admin === 'admin' || participant.admin === 'superadmin');
        })
      }));
      groups.sort((left, right) => Number(right.isAdmin) - Number(left.isAdmin) || left.subject.localeCompare(right.subject));
      return groups;
    });
  }

  async groupMetadata(groupJid) {
    return this.#groupMetaCache.resolve(groupJid, () => this.socket.groupMetadata(groupJid));
  }

  async groupMembers(groupJid) {
    const metadata = await this.groupMetadata(groupJid);
    return (metadata.participants || []).map((participant) => ({
      jid: participant.id,
      phone: String(participant.id).split('@')[0].split(':')[0],
      name: participant.notify || participant.name || null,
      admin: participant.admin || null
    }));
  }

  async isMember(groupJid, phone) {
    const digits = PhoneNumber.normalize(phone);
    if (!digits) return false;
    const members = await this.groupMembers(groupJid);
    return members.some((member) => member.phone === digits);
  }

  async inviteLink(groupJid) {
    const code = await this.socket.groupInviteCode(groupJid);
    return `https://chat.whatsapp.com/${code}`;
  }

  async revokeInviteLink(groupJid) {
    const code = await this.socket.groupRevokeInvite(groupJid);
    this.invalidateGroups();
    return `https://chat.whatsapp.com/${code}`;
  }

  static inviteCodeOf(linkOrCode) {
    const match = String(linkOrCode ?? '').match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : String(linkOrCode ?? '').trim();
  }

  async joinGroup(linkOrCode) {
    const result = await this.socket.groupAcceptInvite(WhatsAppGateway.inviteCodeOf(linkOrCode));
    this.invalidateGroups();
    return result;
  }

  async leaveGroup(groupJid) {
    await this.socket.groupLeave(groupJid);
    this.invalidateGroups();
  }

  async sendText(jid, text) {
    return this.socket.sendMessage(jid, { text });
  }

  async sendImage(jid, url, caption) {
    return this.socket.sendMessage(jid, { image: { url }, caption: caption || undefined });
  }

  async sendVideo(jid, url, caption, asGif) {
    return this.socket.sendMessage(jid, { video: { url }, caption: caption || undefined, gifPlayback: Boolean(asGif) });
  }

  async sendDocument(jid, url, fileName, mimetype) {
    return this.socket.sendMessage(jid, {
      document: { url },
      fileName: fileName || 'file',
      mimetype: mimetype || 'application/octet-stream'
    });
  }

  async sendAudio(jid, url, asVoiceNote) {
    return this.socket.sendMessage(jid, { audio: { url }, ptt: Boolean(asVoiceNote), mimetype: 'audio/mp4' });
  }

  async sendLocation(jid, latitude, longitude, name) {
    return this.socket.sendMessage(jid, {
      location: { degreesLatitude: Number(latitude), degreesLongitude: Number(longitude), name: name || undefined }
    });
  }

  async sendContactCard(jid, displayName, phone) {
    const digits = PhoneNumber.normalize(phone);
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${displayName}`,
      `TEL;type=CELL;type=VOICE;waid=${digits}:+${digits}`,
      'END:VCARD'
    ].join('\n');
    return this.socket.sendMessage(jid, { contacts: { displayName, contacts: [{ vcard }] } });
  }

  async sendButtons(jid, text, footer, buttons) {
    const templateButtons = buttons.map((button, index) => {
      const position = index + 1;
      if (button.kind === 'url') {
        return { index: position, urlButton: { displayText: button.text || `Link ${position}`, url: button.value } };
      }
      if (button.kind === 'call') {
        return { index: position, callButton: { displayText: button.text || `Call ${position}`, phoneNumber: button.value } };
      }
      return { index: position, quickReplyButton: { displayText: button.text || `Option ${position}`, id: button.value || `button_${position}` } };
    });
    return this.socket.sendMessage(jid, { text, footer: footer || undefined, templateButtons });
  }

  async sendPresence(jid, state) {
    await this.socket.sendPresenceUpdate(state, jid);
  }

  async react(jid, emoji, messageKey) {
    await this.socket.sendMessage(jid, { react: { text: emoji, key: messageKey } });
  }

  async deleteMessage(jid, messageKey) {
    await this.socket.sendMessage(jid, { delete: messageKey });
  }

  async addToGroup(groupJid, jid) {
    const result = await this.socket.groupParticipantsUpdate(groupJid, [jid], 'add');
    this.#groupMetaCache.delete(groupJid);
    return result;
  }

  async removeFromGroup(groupJid, jid) {
    const result = await this.socket.groupParticipantsUpdate(groupJid, [jid], 'remove');
    this.#groupMetaCache.delete(groupJid);
    return result;
  }

  async changeRole(groupJid, jid, action) {
    const result = await this.socket.groupParticipantsUpdate(groupJid, [jid], action);
    this.#groupMetaCache.delete(groupJid);
    return result;
  }

  async setGroupSubject(groupJid, subject) {
    await this.socket.groupUpdateSubject(groupJid, subject);
    this.invalidateGroups();
  }

  async setGroupDescription(groupJid, description) {
    await this.socket.groupUpdateDescription(groupJid, description);
  }

  async setGroupSetting(groupJid, mode) {
    await this.socket.groupSettingUpdate(groupJid, mode);
  }

  async setProfileName(name) {
    await this.socket.updateProfileName(name);
  }

  async setProfileStatus(status) {
    await this.socket.updateProfileStatus(status);
  }

  async setProfilePicture(url) {
    await this.socket.updateProfilePicture(this.socket.user.id, { url });
  }
}
