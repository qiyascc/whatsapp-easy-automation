import { WorkflowNode, NodeResult } from '#nodes/WorkflowNode.js';

const ADMIN_COLOR = '#3b82f6';
const GROUP_FIELD = { key: 'group_jid', label: 'Group', type: 'group' };

export class GroupSubjectNode extends WorkflowNode {
  static type = 'group_set_subject';
  static category = 'admin';
  static color = ADMIN_COLOR;
  static costly = true;
  static label = 'Set Group Name';
  static description = 'Renames a group. Admin rights are required.';
  static fields = [GROUP_FIELD, { key: 'subject', label: 'New name', type: 'text' }];

  async execute(context) {
    const groupJid = this.groupJid(context);
    if (!groupJid) return NodeResult.fail('No group selected.');
    const subject = this.text(context, 'subject');
    if (!subject) return NodeResult.fail('No group name configured.');
    try {
      await context.gateway.setGroupSubject(groupJid, subject);
    } catch (error) {
      return NodeResult.fail(`Renaming failed. Check that the account is an admin: ${error.message}`);
    }
    return NodeResult.continue();
  }
}

export class GroupDescriptionNode extends WorkflowNode {
  static type = 'group_set_description';
  static category = 'admin';
  static color = ADMIN_COLOR;
  static costly = true;
  static label = 'Set Group Description';
  static description = 'Replaces the group description. Admin rights are required.';
  static fields = [GROUP_FIELD, { key: 'description', label: 'New description', type: 'textarea' }];

  async execute(context) {
    const groupJid = this.groupJid(context);
    if (!groupJid) return NodeResult.fail('No group selected.');
    try {
      await context.gateway.setGroupDescription(groupJid, this.text(context, 'description'));
    } catch (error) {
      return NodeResult.fail(`Updating the description failed. Check that the account is an admin: ${error.message}`);
    }
    return NodeResult.continue();
  }
}

export class GroupSettingNode extends WorkflowNode {
  static type = 'group_setting';
  static category = 'admin';
  static color = ADMIN_COLOR;
  static costly = true;
  static label = 'Group Permissions';
  static description = 'Controls who may post in the group and who may edit its details.';
  static fields = [
    GROUP_FIELD,
    {
      key: 'mode',
      label: 'Permission',
      type: 'select',
      default: 'announcement',
      options: [
        { value: 'announcement', label: 'Only admins can send messages' },
        { value: 'not_announcement', label: 'Everyone can send messages' },
        { value: 'locked', label: 'Only admins can edit group info' },
        { value: 'unlocked', label: 'Everyone can edit group info' }
      ]
    }
  ];

  async execute(context) {
    const groupJid = this.groupJid(context);
    if (!groupJid) return NodeResult.fail('No group selected.');
    try {
      await context.gateway.setGroupSetting(groupJid, this.raw(context, 'mode', 'announcement'));
    } catch (error) {
      return NodeResult.fail(`Changing the permission failed. Check that the account is an admin: ${error.message}`);
    }
    return NodeResult.continue();
  }
}

export class GroupRevokeInviteNode extends WorkflowNode {
  static type = 'group_revoke_invite';
  static category = 'admin';
  static color = ADMIN_COLOR;
  static costly = true;
  static label = 'Reset Invite Link';
  static description = 'Revokes the current group invite link and generates a fresh one.';
  static fields = [GROUP_FIELD];

  async execute(context) {
    const groupJid = this.groupJid(context);
    if (!groupJid) return NodeResult.fail('No group selected.');
    try {
      const link = await context.gateway.revokeInviteLink(groupJid);
      context.variables.inviteLink = link;
      context.services.logger.info('The group invite link was reset.');
    } catch (error) {
      return NodeResult.fail(`Resetting the invite link failed. Check that the account is an admin: ${error.message}`);
    }
    return NodeResult.continue();
  }
}

export class ProfileNameNode extends WorkflowNode {
  static type = 'profile_name';
  static category = 'profile';
  static color = '#64748b';
  static costly = true;
  static label = 'Set My Name';
  static description = 'Updates the profile name of the connected WhatsApp account.';
  static fields = [{ key: 'name', label: 'Profile name', type: 'text' }];

  async execute(context) {
    const name = this.text(context, 'name');
    if (!name) return NodeResult.skip('No profile name configured.');
    try {
      await context.gateway.setProfileName(name);
    } catch (error) {
      return NodeResult.fail(`Updating the profile name failed: ${error.message}`);
    }
    return NodeResult.continue();
  }
}

export class ProfileStatusNode extends WorkflowNode {
  static type = 'profile_status';
  static category = 'profile';
  static color = '#64748b';
  static costly = true;
  static label = 'Set My Status';
  static description = 'Updates the about text of the connected WhatsApp account.';
  static fields = [{ key: 'status', label: 'Status text', type: 'text' }];

  async execute(context) {
    const status = this.text(context, 'status');
    if (!status) return NodeResult.skip('No status text configured.');
    try {
      await context.gateway.setProfileStatus(status);
    } catch (error) {
      return NodeResult.fail(`Updating the status failed: ${error.message}`);
    }
    return NodeResult.continue();
  }
}

export class ProfilePictureNode extends WorkflowNode {
  static type = 'profile_picture';
  static category = 'profile';
  static color = '#64748b';
  static costly = true;
  static label = 'Set My Photo';
  static description = 'Replaces the profile photo of the connected WhatsApp account with an image from a URL.';
  static fields = [{ key: 'url', label: 'Image URL', type: 'text' }];

  async execute(context) {
    const url = this.text(context, 'url');
    if (!url) return NodeResult.fail('No image URL configured.');
    try {
      await context.gateway.setProfilePicture(url);
    } catch (error) {
      return NodeResult.fail(`Updating the profile photo failed: ${error.message}`);
    }
    return NodeResult.continue();
  }
}
