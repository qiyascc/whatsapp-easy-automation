import { WorkflowNode, NodeResult } from '../WorkflowNode.js';
import { WhatsAppGateway } from '../../whatsapp/WhatsAppGateway.js';

const GROUP_COLOR = '#16a34a';
const GROUP_FIELD = { key: 'group_jid', label: 'Group', type: 'group' };

export class GroupInviteNode extends WorkflowNode {
  static type = 'group_invite';
  static category = 'group';
  static scope = 'contact';
  static color = GROUP_COLOR;
  static costly = true;
  static label = 'Send Group Invite';
  static description = 'Sends the group invite link to the contact. Your account must be an admin of that group.';
  static fields = [GROUP_FIELD, { key: 'message', label: 'Message before the link', type: 'textarea' }];

  async execute(context) {
    if (!context.contact) return NodeResult.skip('This step needs a contact.');
    const groupJid = this.groupJid(context);
    if (!groupJid) return NodeResult.fail('No group selected.');
    const jid = await this.contactJid(context);
    if (!jid) return NodeResult.fail('The contact is not reachable on WhatsApp.');

    let link;
    try {
      link = await context.gateway.inviteLink(groupJid);
    } catch (error) {
      return NodeResult.fail(`Could not read the invite link. Check that the account is an admin: ${error.message}`);
    }

    const intro = this.text(context, 'message') || context.settings.default_invite_message;
    const sent = await context.gateway.sendText(jid, `${intro}\n${link}`.trim());
    this.rememberMessage(context, sent, jid);
    context.services.contacts.update(context.contact.id, { status: 'invited', invited_at: Date.now(), last_error: null });
    return NodeResult.continue();
  }
}

export class GroupAddNode extends WorkflowNode {
  static type = 'group_add';
  static category = 'group';
  static scope = 'contact';
  static color = GROUP_COLOR;
  static costly = true;
  static label = 'Add to Group';
  static description = 'Adds the contact to the group directly. When WhatsApp privacy settings block that, the invite link is sent instead.';
  static fields = [
    GROUP_FIELD,
    { key: 'fallback_to_invite', label: 'Send the invite link when adding is blocked', type: 'checkbox', default: 'true' }
  ];

  async execute(context) {
    if (!context.contact) return NodeResult.skip('This step needs a contact.');
    const groupJid = this.groupJid(context);
    if (!groupJid) return NodeResult.fail('No group selected.');
    const jid = await this.contactJid(context);
    if (!jid) return NodeResult.fail('The contact is not reachable on WhatsApp.');

    let response;
    try {
      response = await context.gateway.addToGroup(groupJid, jid);
    } catch (error) {
      return NodeResult.fail(`Adding failed. Check that the account is an admin: ${error.message}`);
    }

    const status = String(response?.[0]?.status ?? '');
    if (status === '200' || status === '409') {
      context.services.contacts.update(context.contact.id, { status: 'in_group', joined_at: Date.now(), last_error: null });
      return NodeResult.continue();
    }

    if (!this.flag(context, 'fallback_to_invite', true)) {
      context.services.contacts.update(context.contact.id, { status: 'failed', last_error: `Adding returned ${status}.` });
      return NodeResult.fail(`WhatsApp refused the direct add with status ${status}.`);
    }

    try {
      const link = await context.gateway.inviteLink(groupJid);
      await context.gateway.sendText(jid, `${context.settings.default_invite_message}\n${link}`.trim());
      context.services.contacts.update(context.contact.id, {
        status: 'invited',
        invited_at: Date.now(),
        last_error: `Direct add returned ${status}, the invite link was sent instead.`
      });
      return NodeResult.continue();
    } catch (error) {
      context.services.contacts.update(context.contact.id, { status: 'failed', last_error: error.message });
      return NodeResult.fail(`Adding returned ${status} and the invite link could not be sent: ${error.message}`);
    }
  }
}

export class GroupRemoveNode extends WorkflowNode {
  static type = 'group_remove';
  static category = 'group';
  static scope = 'contact';
  static color = '#ef4444';
  static costly = true;
  static label = 'Remove from Group';
  static description = 'Removes the contact from the group. Admin rights are required.';
  static fields = [GROUP_FIELD];

  async execute(context) {
    if (!context.contact) return NodeResult.skip('This step needs a contact.');
    const groupJid = this.groupJid(context);
    if (!groupJid) return NodeResult.fail('No group selected.');
    const jid = await this.contactJid(context);
    if (!jid) return NodeResult.fail('The contact is not reachable on WhatsApp.');
    try {
      await context.gateway.removeFromGroup(groupJid, jid);
    } catch (error) {
      return NodeResult.fail(`Removing failed. Check that the account is an admin: ${error.message}`);
    }
    return NodeResult.continue();
  }
}

export class GroupRoleNode extends WorkflowNode {
  static type = 'group_promote';
  static category = 'group';
  static scope = 'contact';
  static color = GROUP_COLOR;
  static costly = true;
  static label = 'Promote or Demote';
  static description = 'Grants or revokes group admin rights for the contact.';
  static fields = [
    GROUP_FIELD,
    {
      key: 'action',
      label: 'Action',
      type: 'select',
      default: 'promote',
      options: [
        { value: 'promote', label: 'Promote to admin' },
        { value: 'demote', label: 'Demote to member' }
      ]
    }
  ];

  async execute(context) {
    if (!context.contact) return NodeResult.skip('This step needs a contact.');
    const groupJid = this.groupJid(context);
    if (!groupJid) return NodeResult.fail('No group selected.');
    const jid = await this.contactJid(context);
    if (!jid) return NodeResult.fail('The contact is not reachable on WhatsApp.');
    const action = this.raw(context, 'action', 'promote') === 'demote' ? 'demote' : 'promote';
    try {
      await context.gateway.changeRole(groupJid, jid, action);
    } catch (error) {
      return NodeResult.fail(`Role change failed. Check that the account is an admin: ${error.message}`);
    }
    return NodeResult.continue();
  }
}

export class JoinGroupNode extends WorkflowNode {
  static type = 'join_group';
  static category = 'group';
  static color = GROUP_COLOR;
  static costly = true;
  static label = 'Join Group';
  static description = 'Your own account joins a group through an invite link or code. Running it again when already a member is harmless.';
  static fields = [
    { key: 'invite', label: 'Invite link or code', type: 'text', placeholder: 'https://chat.whatsapp.com/XXXXXXXXXXX' }
  ];

  async execute(context) {
    const invite = this.text(context, 'invite');
    if (!invite) return NodeResult.fail('No invite link configured.');
    try {
      const groupJid = await context.gateway.joinGroup(invite);
      context.services.logger.info(`Joined group ${groupJid ?? WhatsAppGateway.inviteCodeOf(invite)}.`);
      return NodeResult.continue();
    } catch (error) {
      if (/already|conflict|409/i.test(error.message)) return NodeResult.continue();
      return NodeResult.fail(`Joining failed: ${error.message}`);
    }
  }
}

export class LeaveGroupNode extends WorkflowNode {
  static type = 'leave_group';
  static category = 'group';
  static color = '#ef4444';
  static costly = true;
  static label = 'Leave Group';
  static description = 'Your own account leaves the selected group.';
  static fields = [GROUP_FIELD];

  async execute(context) {
    const groupJid = this.groupJid(context);
    if (!groupJid) return NodeResult.fail('No group selected.');
    try {
      await context.gateway.leaveGroup(groupJid);
    } catch (error) {
      return NodeResult.fail(`Leaving failed: ${error.message}`);
    }
    return NodeResult.continue();
  }
}

export class GroupSendTextNode extends WorkflowNode {
  static type = 'group_send_text';
  static category = 'group';
  static color = GROUP_COLOR;
  static costly = true;
  static label = 'Post Text to Group';
  static description = 'Posts a message into a group. It runs once per trigger event even when the flow fans out to many contacts.';
  static fields = [GROUP_FIELD, { key: 'text', label: 'Message', type: 'textarea' }];

  async execute(context) {
    const groupJid = this.groupJid(context);
    if (!groupJid) return NodeResult.fail('No group selected.');
    const body = this.text(context, 'text');
    if (!body.trim()) return NodeResult.skip('No message body configured.');
    await context.gateway.sendText(groupJid, body);
    return NodeResult.continue();
  }
}

export class GroupSendImageNode extends WorkflowNode {
  static type = 'group_send_image';
  static category = 'group';
  static color = GROUP_COLOR;
  static costly = true;
  static label = 'Post Image to Group';
  static description = 'Posts an image from a URL into a group. It runs once per trigger event.';
  static fields = [GROUP_FIELD, { key: 'url', label: 'Image URL', type: 'text' }, { key: 'caption', label: 'Caption', type: 'textarea' }];

  async execute(context) {
    const groupJid = this.groupJid(context);
    if (!groupJid) return NodeResult.fail('No group selected.');
    const url = this.text(context, 'url');
    if (!url) return NodeResult.fail('No image URL configured.');
    await context.gateway.sendImage(groupJid, url, this.text(context, 'caption'));
    return NodeResult.continue();
  }
}
