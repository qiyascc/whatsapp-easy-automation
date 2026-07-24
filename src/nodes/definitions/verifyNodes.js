import { WorkflowNode, NodeResult } from '#nodes/WorkflowNode.js';
import { Template } from '#core/Template.js';

const VERIFY_COLOR = '#8b5cf6';
const ON_FALSE_FIELD = {
  key: 'on_false',
  label: 'When the answer is no',
  type: 'select',
  default: 'branch',
  options: [
    { value: 'branch', label: 'Follow the false output' },
    { value: 'stop', label: 'End this run' }
  ]
};

class BranchingNode extends WorkflowNode {
  static category = 'verify';
  static color = VERIFY_COLOR;
  static outputs = ['true', 'false'];

  resolveFalse(context) {
    return this.raw(context, 'on_false', 'branch') === 'stop' ? NodeResult.stop('Verification failed.') : NodeResult.branch(false);
  }
}

export class VerifyInGroupNode extends BranchingNode {
  static type = 'verify_in_group';
  static scope = 'contact';
  static label = 'Is In Group?';
  static description = 'Checks whether the contact is currently a member of the selected group.';
  static fields = [{ key: 'group_jid', label: 'Group', type: 'group' }, ON_FALSE_FIELD];

  async execute(context) {
    if (!context.contact) return NodeResult.skip('This step needs a contact.');
    const groupJid = this.groupJid(context);
    if (!groupJid) return NodeResult.fail('No group selected.');
    let member = false;
    try {
      member = await context.gateway.isMember(groupJid, context.contact.phone);
    } catch (error) {
      return NodeResult.fail(`Reading the group members failed: ${error.message}`);
    }
    if (member) {
      context.services.contacts.update(context.contact.id, {
        status: 'in_group',
        joined_at: context.contact.joinedAt || Date.now()
      });
      return NodeResult.branch(true);
    }
    return this.resolveFalse(context);
  }
}

export class VerifyLeftGroupNode extends BranchingNode {
  static type = 'verify_left_group';
  static scope = 'contact';
  static label = 'Has Left Group?';
  static description = 'True when the contact is not a member of the selected group.';
  static fields = [{ key: 'group_jid', label: 'Group', type: 'group' }, ON_FALSE_FIELD];

  async execute(context) {
    if (!context.contact) return NodeResult.skip('This step needs a contact.');
    const groupJid = this.groupJid(context);
    if (!groupJid) return NodeResult.fail('No group selected.');
    let member = false;
    try {
      member = await context.gateway.isMember(groupJid, context.contact.phone);
    } catch (error) {
      return NodeResult.fail(`Reading the group members failed: ${error.message}`);
    }
    if (!member) return NodeResult.branch(true);
    return this.resolveFalse(context);
  }
}

export class VerifyNumberExistsNode extends BranchingNode {
  static type = 'verify_number_exists';
  static scope = 'contact';
  static label = 'Is On WhatsApp?';
  static description = 'Checks whether the contact phone number is registered on WhatsApp.';
  static fields = [ON_FALSE_FIELD];

  async execute(context) {
    if (!context.contact) return NodeResult.skip('This step needs a contact.');
    let jid = null;
    try {
      jid = await context.gateway.resolveJid(context.contact.phone);
    } catch (error) {
      return NodeResult.fail(`The lookup failed: ${error.message}`);
    }
    if (jid) {
      context.services.contacts.update(context.contact.id, { jid });
      return NodeResult.branch(true);
    }
    context.services.contacts.update(context.contact.id, { status: 'invalid', last_error: 'This number is not on WhatsApp.' });
    return this.resolveFalse(context);
  }
}

export class ConditionNode extends BranchingNode {
  static type = 'condition';
  static label = 'Condition';
  static description = 'Compares two values and branches. Both sides accept placeholders such as {{text}}, {{status}} or {{vars.response.code}}.';
  static fields = [
    { key: 'left', label: 'Left value', type: 'text', default: '{{text}}' },
    {
      key: 'operator',
      label: 'Operator',
      type: 'select',
      default: 'contains',
      options: [
        { value: 'equals', label: 'equals' },
        { value: 'not_equals', label: 'does not equal' },
        { value: 'contains', label: 'contains' },
        { value: 'not_contains', label: 'does not contain' },
        { value: 'starts_with', label: 'starts with' },
        { value: 'matches_regex', label: 'matches regular expression' },
        { value: 'is_empty', label: 'is empty' },
        { value: 'is_not_empty', label: 'is not empty' },
        { value: 'greater_than', label: 'is greater than' },
        { value: 'less_than', label: 'is less than' }
      ]
    },
    {
      key: 'right',
      label: 'Right value',
      type: 'text',
      dependsOn: {
        key: 'operator',
        in: ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'matches_regex', 'greater_than', 'less_than']
      }
    },
    { key: 'case_sensitive', label: 'Case sensitive', type: 'checkbox', default: 'false' },
    ON_FALSE_FIELD
  ];

  async execute(context) {
    const caseSensitive = this.flag(context, 'case_sensitive', false);
    const rawLeft = Template.render(this.raw(context, 'left'), context.scope);
    const rawRight = Template.render(this.raw(context, 'right'), context.scope);
    const left = caseSensitive ? rawLeft : rawLeft.toLowerCase();
    const right = caseSensitive ? rawRight : rawRight.toLowerCase();
    const operator = this.raw(context, 'operator', 'contains');

    const outcome = ConditionNode.compare(operator, left, right, rawLeft, rawRight);
    return outcome ? NodeResult.branch(true) : this.resolveFalse(context);
  }

  static compare(operator, left, right, rawLeft, rawRight) {
    switch (operator) {
      case 'equals':
        return left === right;
      case 'not_equals':
        return left !== right;
      case 'contains':
        return left.includes(right);
      case 'not_contains':
        return !left.includes(right);
      case 'starts_with':
        return left.startsWith(right);
      case 'matches_regex':
        try {
          return new RegExp(rawRight).test(rawLeft);
        } catch {
          return false;
        }
      case 'is_empty':
        return left.trim() === '';
      case 'is_not_empty':
        return left.trim() !== '';
      case 'greater_than':
        return Number(rawLeft) > Number(rawRight);
      case 'less_than':
        return Number(rawLeft) < Number(rawRight);
      default:
        return false;
    }
  }
}

export class CheckJoinedNode extends VerifyInGroupNode {
  static type = 'check_joined';
  static label = 'Check Joined';
  static description = 'Branches on whether the contact has joined the group yet.';
}
