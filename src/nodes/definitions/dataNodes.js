import { WorkflowNode, NodeResult } from '../WorkflowNode.js';
import { PhoneNumber } from '../../core/PhoneNumber.js';
import { ContactRepository } from '../../db/repositories/ContactRepository.js';
import { clamp } from '../../core/Support.js';

const DATA_COLOR = '#0ea5e9';
const SCRAPE_COOLDOWN_MS = 300000;

export class ExtractNumbersNode extends WorkflowNode {
  static type = 'extract_numbers';
  static category = 'data';
  static color = DATA_COLOR;
  static label = 'Extract Numbers';
  static description = 'Reads phone numbers out of any text and stores them as contacts. The result is available as {{vars.extracted}}.';
  static fields = [
    { key: 'source_text', label: 'Text to scan', type: 'textarea', default: '{{text}}' },
    { key: 'allow_bare_numbers', label: 'Accept numbers written without a leading +', type: 'checkbox', default: 'false' },
    { key: 'save_contacts', label: 'Save the numbers as contacts', type: 'checkbox', default: 'true' },
    {
      key: 'status',
      label: 'Save them with status',
      type: 'select',
      default: 'pending',
      options: ContactRepository.statuses.map((status) => ({ value: status, label: status })),
      dependsOn: { key: 'save_contacts', in: ['true'] }
    },
    { key: 'assign_to_run', label: 'Attach the first number to this run', type: 'checkbox', default: 'false' }
  ];

  async execute(context) {
    const text = this.text(context, 'source_text', '{{text}}');
    const phones = PhoneNumber.extractAll(text, { allowBare: this.flag(context, 'allow_bare_numbers', false) });
    context.variables.extracted = phones;
    if (!phones.length) return NodeResult.skip('No phone number was found in the text.');

    if (this.flag(context, 'save_contacts', true)) {
      const status = this.raw(context, 'status', 'pending');
      for (const phone of phones) {
        context.services.contacts.upsert({ phone, source: `workflow:${context.run.workflowId}`, status });
      }
    }

    if (this.flag(context, 'assign_to_run', false) && !context.contact) {
      const first = context.services.contacts.findByPhone(phones[0]);
      if (first) context.assignContact(first);
    }

    return NodeResult.continue();
  }
}

export class SaveContactNode extends WorkflowNode {
  static type = 'save_contact';
  static category = 'data';
  static color = DATA_COLOR;
  static label = 'Save Contact';
  static description = 'Creates or updates a single contact from a phone number and an optional name.';
  static fields = [
    { key: 'phone', label: 'Phone number', type: 'text', default: '{{phone}}' },
    { key: 'name', label: 'Name', type: 'text', default: '{{name}}' },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      default: 'pending',
      options: ContactRepository.statuses.map((status) => ({ value: status, label: status }))
    },
    { key: 'assign_to_run', label: 'Attach it to this run', type: 'checkbox', default: 'true' }
  ];

  async execute(context) {
    const phone = PhoneNumber.normalize(this.text(context, 'phone', '{{phone}}'));
    if (!phone) return NodeResult.skip('No usable phone number was provided.');
    const name = this.text(context, 'name') || null;
    const { contact } = context.services.contacts.upsert({
      phone,
      name,
      source: `workflow:${context.run.workflowId}`,
      status: this.raw(context, 'status', 'pending')
    });
    if (contact && this.flag(context, 'assign_to_run', true)) context.assignContact(contact);
    return NodeResult.continue();
  }
}

export class SetContactStatusNode extends WorkflowNode {
  static type = 'set_contact_status';
  static category = 'data';
  static scope = 'contact';
  static color = DATA_COLOR;
  static label = 'Set Contact Status';
  static description = 'Marks the contact of this run with a new status.';
  static fields = [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      default: 'in_group',
      options: ContactRepository.statuses.map((status) => ({ value: status, label: status }))
    },
    { key: 'note', label: 'Note', type: 'text' }
  ];

  async execute(context) {
    if (!context.contact) return NodeResult.skip('This step needs a contact.');
    context.services.contacts.update(context.contact.id, {
      status: this.raw(context, 'status', 'pending'),
      last_error: this.text(context, 'note') || null
    });
    return NodeResult.continue();
  }
}

export class ScrapeGroupNode extends WorkflowNode {
  static type = 'scrape_group';
  static category = 'data';
  static color = DATA_COLOR;
  static costly = true;
  static label = 'Scrape Group Members';
  static description = 'Reads every member of a group your account belongs to and stores them as contacts. Throttled to once every five minutes per group.';
  static fields = [
    { key: 'group_jid', label: 'Group', type: 'group' },
    {
      key: 'status',
      label: 'Save members with status',
      type: 'select',
      default: 'in_group',
      options: ContactRepository.statuses.map((status) => ({ value: status, label: status }))
    },
    { key: 'limit', label: 'Maximum members to import', type: 'number', default: '1000' }
  ];

  async execute(context) {
    const groupJid = this.groupJid(context);
    if (!groupJid) return NodeResult.fail('No group selected.');

    const throttleKey = `scrape:${context.run.workflowId}:${groupJid}`;
    const lastRun = context.services.state.number(throttleKey, 0);
    if (Date.now() - lastRun < SCRAPE_COOLDOWN_MS) return NodeResult.skip('This group was scraped less than five minutes ago.');
    context.services.state.set(throttleKey, String(Date.now()));

    let members;
    try {
      members = await context.gateway.groupMembers(groupJid);
    } catch (error) {
      return NodeResult.fail(`Reading the group members failed. Is the account a member? ${error.message}`);
    }

    const limit = clamp(this.integer(context, 'limit', 1000), 1, 5000);
    const status = this.raw(context, 'status', 'in_group');
    let imported = 0;
    for (const member of members.slice(0, limit)) {
      const phone = PhoneNumber.normalize(member.phone);
      if (!phone) continue;
      const { contact, created } = context.services.contacts.upsert({
        phone,
        name: member.name,
        source: `group:${groupJid}`,
        status
      });
      if (created) imported += 1;
      if (contact && status === 'in_group') {
        context.services.contacts.update(contact.id, { jid: member.jid, joined_at: Date.now(), status });
      }
    }
    context.variables.scrapedMembers = members.length;
    context.services.logger.info(`Scraped ${members.length} member(s) from a group, ${imported} were new.`);
    return NodeResult.continue();
  }
}

export class LogNode extends WorkflowNode {
  static type = 'log_message';
  static category = 'data';
  static color = '#64748b';
  static label = 'Write Log Entry';
  static description = 'Writes a line into the activity log. Useful for debugging a flow.';
  static fields = [
    {
      key: 'level',
      label: 'Level',
      type: 'select',
      default: 'info',
      options: [
        { value: 'info', label: 'info' },
        { value: 'warn', label: 'warn' },
        { value: 'error', label: 'error' }
      ]
    },
    { key: 'message', label: 'Message', type: 'textarea', default: 'Run reached this step for {{phone}}' }
  ];

  async execute(context) {
    const level = ['info', 'warn', 'error'].includes(this.raw(context, 'level', 'info')) ? this.raw(context, 'level', 'info') : 'info';
    context.services.logger[level](this.text(context, 'message'));
    return NodeResult.continue();
  }
}
