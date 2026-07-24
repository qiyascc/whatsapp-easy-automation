import { WorkflowNode, NodeResult } from '../WorkflowNode.js';
import { sleep, clamp } from '../../core/Support.js';

const MESSAGING_COLOR = '#25d366';

class ContactMessageNode extends WorkflowNode {
  static category = 'messaging';
  static scope = 'contact';
  static color = MESSAGING_COLOR;
  static costly = true;

  async execute(context) {
    if (!context.contact) return NodeResult.skip('This step needs a contact.');
    const jid = await this.contactJid(context);
    if (!jid) return NodeResult.fail('The contact is not reachable on WhatsApp.');
    return this.deliver(context, jid);
  }

  async deliver() {
    return NodeResult.skip('Nothing to deliver.');
  }
}

export class SendTextNode extends ContactMessageNode {
  static type = 'send_text';
  static label = 'Send Text';
  static description = 'Sends a plain text message to the contact.';
  static fields = [
    { key: 'text', label: 'Message', type: 'textarea', placeholder: 'Hello {{name}}, welcome!' }
  ];

  async deliver(context, jid) {
    const body = this.text(context, 'text');
    if (!body.trim()) return NodeResult.skip('No message body configured.');
    const sent = await context.gateway.sendText(jid, body);
    this.rememberMessage(context, sent, jid);
    return NodeResult.continue();
  }
}

export class SendLinkNode extends ContactMessageNode {
  static type = 'send_link';
  static label = 'Send Link';
  static description = 'Sends a message containing a URL so WhatsApp renders a link preview.';
  static fields = [
    { key: 'text', label: 'Message with URL', type: 'textarea', placeholder: 'Have a look: https://example.com' }
  ];

  async deliver(context, jid) {
    const body = this.text(context, 'text');
    if (!body.trim()) return NodeResult.skip('No message body configured.');
    const sent = await context.gateway.sendText(jid, body);
    this.rememberMessage(context, sent, jid);
    return NodeResult.continue();
  }
}

export class SendImageNode extends ContactMessageNode {
  static type = 'send_image';
  static label = 'Send Image';
  static description = 'Sends an image from a URL with an optional caption.';
  static fields = [
    { key: 'url', label: 'Image URL', type: 'text', placeholder: 'https://example.com/photo.jpg' },
    { key: 'caption', label: 'Caption', type: 'textarea' }
  ];

  async deliver(context, jid) {
    const url = this.text(context, 'url');
    if (!url) return NodeResult.fail('No image URL configured.');
    const sent = await context.gateway.sendImage(jid, url, this.text(context, 'caption'));
    this.rememberMessage(context, sent, jid);
    return NodeResult.continue();
  }
}

export class SendVideoNode extends ContactMessageNode {
  static type = 'send_video';
  static label = 'Send Video';
  static description = 'Sends a video from a URL, optionally looped as a GIF.';
  static fields = [
    { key: 'url', label: 'Video URL', type: 'text', placeholder: 'https://example.com/clip.mp4' },
    { key: 'caption', label: 'Caption', type: 'textarea' },
    { key: 'gif', label: 'Play as a looping GIF', type: 'checkbox', default: 'false' }
  ];

  async deliver(context, jid) {
    const url = this.text(context, 'url');
    if (!url) return NodeResult.fail('No video URL configured.');
    const sent = await context.gateway.sendVideo(jid, url, this.text(context, 'caption'), this.flag(context, 'gif'));
    this.rememberMessage(context, sent, jid);
    return NodeResult.continue();
  }
}

export class SendDocumentNode extends ContactMessageNode {
  static type = 'send_document';
  static label = 'Send Document';
  static description = 'Sends a file from a URL as a document.';
  static fields = [
    { key: 'url', label: 'File URL', type: 'text', placeholder: 'https://example.com/price-list.pdf' },
    { key: 'file_name', label: 'File name', type: 'text', placeholder: 'price-list.pdf' },
    { key: 'mimetype', label: 'MIME type', type: 'text', placeholder: 'application/pdf' }
  ];

  async deliver(context, jid) {
    const url = this.text(context, 'url');
    if (!url) return NodeResult.fail('No file URL configured.');
    const sent = await context.gateway.sendDocument(jid, url, this.text(context, 'file_name'), this.text(context, 'mimetype'));
    this.rememberMessage(context, sent, jid);
    return NodeResult.continue();
  }
}

export class SendAudioNode extends ContactMessageNode {
  static type = 'send_audio';
  static label = 'Send Audio';
  static description = 'Sends an audio file from a URL, optionally as a voice note.';
  static fields = [
    { key: 'url', label: 'Audio URL', type: 'text', placeholder: 'https://example.com/intro.mp3' },
    { key: 'voice_note', label: 'Send as a voice note', type: 'checkbox', default: 'false' }
  ];

  async deliver(context, jid) {
    const url = this.text(context, 'url');
    if (!url) return NodeResult.fail('No audio URL configured.');
    const sent = await context.gateway.sendAudio(jid, url, this.flag(context, 'voice_note'));
    this.rememberMessage(context, sent, jid);
    return NodeResult.continue();
  }
}

export class SendLocationNode extends ContactMessageNode {
  static type = 'send_location';
  static label = 'Send Location';
  static description = 'Sends a map pin.';
  static fields = [
    { key: 'latitude', label: 'Latitude', type: 'text', placeholder: '40.4093' },
    { key: 'longitude', label: 'Longitude', type: 'text', placeholder: '49.8671' },
    { key: 'place_name', label: 'Place name', type: 'text' }
  ];

  async deliver(context, jid) {
    const latitude = Number(this.text(context, 'latitude'));
    const longitude = Number(this.text(context, 'longitude'));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return NodeResult.fail('Latitude and longitude are required.');
    await context.gateway.sendLocation(jid, latitude, longitude, this.text(context, 'place_name'));
    return NodeResult.continue();
  }
}

export class SendContactCardNode extends ContactMessageNode {
  static type = 'send_contact_card';
  static label = 'Send Contact Card';
  static description = 'Shares a vCard contact with the recipient.';
  static fields = [
    { key: 'display_name', label: 'Contact name', type: 'text' },
    { key: 'phone', label: 'Contact phone', type: 'text', placeholder: '994501234567' }
  ];

  async deliver(context, jid) {
    const phone = this.text(context, 'phone');
    if (!phone) return NodeResult.fail('A phone number for the card is required.');
    await context.gateway.sendContactCard(jid, this.text(context, 'display_name', 'Contact'), phone);
    return NodeResult.continue();
  }
}

export class TypingNode extends ContactMessageNode {
  static type = 'typing';
  static label = 'Show Typing';
  static description = 'Shows a typing indicator for a few seconds so the conversation feels human.';
  static color = '#64748b';
  static costly = false;
  static fields = [{ key: 'seconds', label: 'Seconds', type: 'number', default: '3' }];

  async deliver(context, jid) {
    const seconds = clamp(this.integer(context, 'seconds', 3), 1, 30);
    try {
      await context.gateway.sendPresence(jid, 'composing');
      await sleep(seconds * 1000);
      await context.gateway.sendPresence(jid, 'paused');
    } catch {
      return NodeResult.skip('Presence updates are not available on this session.');
    }
    return NodeResult.continue();
  }
}

export class SendButtonsNode extends ContactMessageNode {
  static type = 'send_buttons';
  static label = 'Send Buttons';
  static description = 'Sends a button message. WhatsApp blocks these on most accounts, so the node falls back to plain text with the links.';
  static color = '#b45309';
  static fields = [
    { key: 'text', label: 'Message', type: 'textarea' },
    { key: 'footer', label: 'Footer', type: 'text' },
    { key: 'buttons', label: 'Buttons', type: 'buttons' }
  ];

  async deliver(context, jid) {
    const buttons = SendButtonsNode.parse(this.raw(context, 'buttons'));
    if (!buttons.length) return NodeResult.skip('No buttons configured.');
    const body = this.text(context, 'text');
    try {
      const sent = await context.gateway.sendButtons(jid, body, this.text(context, 'footer'), buttons);
      this.rememberMessage(context, sent, jid);
      return NodeResult.continue();
    } catch {
      const links = buttons.filter((button) => button.kind === 'url' && button.value).map((button) => `${button.text}: ${button.value}`);
      const fallback = [body, ...links].filter(Boolean).join('\n');
      if (!fallback.trim()) return NodeResult.skip('Button delivery failed and there was no text to fall back to.');
      const sent = await context.gateway.sendText(jid, fallback);
      this.rememberMessage(context, sent, jid);
      return NodeResult.continue();
    }
  }

  static parse(raw) {
    return String(raw ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('|').map((part) => part.trim());
        if (parts.length < 2) return { kind: 'reply', text: parts[0], value: '' };
        const kind = ['reply', 'url', 'call'].includes(parts[0].toLowerCase()) ? parts[0].toLowerCase() : 'reply';
        return { kind, text: parts[1], value: parts[2] || '' };
      })
      .filter((button) => button.text);
  }
}

export class ReactLastMessageNode extends ContactMessageNode {
  static type = 'react_last_message';
  static label = 'React to Last Message';
  static description = 'Reacts with an emoji to the most recent message this run sent to the contact.';
  static fields = [{ key: 'emoji', label: 'Emoji', type: 'text', default: '👍' }];

  async deliver(context) {
    const key = context.variables.lastMessageKey;
    const jid = context.variables.lastMessageJid;
    if (!key || !jid) return NodeResult.skip('This run has not sent a message yet.');
    await context.gateway.react(jid, this.text(context, 'emoji', '👍'), key);
    return NodeResult.continue();
  }
}

export class DeleteLastMessageNode extends ContactMessageNode {
  static type = 'delete_last_message';
  static label = 'Delete Last Message';
  static description = 'Deletes for everyone the most recent message this run sent to the contact.';
  static color = '#ef4444';
  static fields = [];

  async deliver(context) {
    const key = context.variables.lastMessageKey;
    const jid = context.variables.lastMessageJid;
    if (!key || !jid) return NodeResult.skip('This run has not sent a message yet.');
    await context.gateway.deleteMessage(jid, key);
    context.variables.lastMessageKey = null;
    return NodeResult.continue();
  }
}
