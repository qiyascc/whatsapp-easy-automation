import { WorkflowNode, NodeResult } from '../WorkflowNode.js';
import { MatchRule } from '../../triggers/MatchRule.js';
import { ContactRepository } from '../../db/repositories/ContactRepository.js';

const MATCH_FIELDS = [
  {
    key: 'sender_filter',
    label: 'Only from these senders',
    type: 'text',
    placeholder: 'billing@shop.com, 994501234567, @support_bot',
    help: 'Comma separated. Leave empty to accept every sender. Wildcards such as *@shop.com are supported.'
  },
  {
    key: 'match_mode',
    label: 'Message must',
    type: 'select',
    default: 'any',
    options: [
      { value: 'any', label: 'Match anything' },
      { value: 'command', label: 'Start with a command word' },
      { value: 'starts_with', label: 'Start with a phrase' },
      { value: 'contains', label: 'Contain a phrase' },
      { value: 'equals', label: 'Exactly equal a phrase' },
      { value: 'regex', label: 'Match a regular expression' }
    ]
  },
  {
    key: 'match_value',
    label: 'Phrase, command or pattern',
    type: 'text',
    placeholder: '/add',
    dependsOn: { key: 'match_mode', in: ['command', 'starts_with', 'contains', 'equals', 'regex'] }
  },
  {
    key: 'case_sensitive',
    label: 'Case sensitive matching',
    type: 'checkbox',
    default: 'false',
    dependsOn: { key: 'match_mode', in: ['command', 'starts_with', 'contains', 'equals', 'regex'] }
  },
  {
    key: 'extract',
    label: 'Take contacts from',
    type: 'select',
    default: 'text_numbers',
    options: [
      { value: 'text_numbers', label: 'Phone numbers inside the message' },
      { value: 'sender_number', label: 'The sender itself' },
      { value: 'payload_field', label: 'A field of the JSON payload' },
      { value: 'none', label: 'Nothing, run without a contact' }
    ]
  },
  {
    key: 'payload_field',
    label: 'Payload field path',
    type: 'text',
    placeholder: 'customer.phone',
    dependsOn: { key: 'extract', in: ['payload_field'] }
  },
  {
    key: 'allow_bare_numbers',
    label: 'Accept numbers written without a leading +',
    type: 'checkbox',
    default: 'false',
    dependsOn: { key: 'extract', in: ['text_numbers'] }
  },
  {
    key: 'contact_status',
    label: 'Save new contacts as',
    type: 'select',
    default: 'pending',
    options: ContactRepository.statuses.map((status) => ({ value: status, label: status })),
    dependsOn: { key: 'extract', in: ['text_numbers', 'sender_number', 'payload_field'] }
  },
  {
    key: 'fan_out',
    label: 'Run the flow',
    type: 'select',
    default: 'per_contact',
    options: [
      { value: 'per_contact', label: 'Once for every extracted contact' },
      { value: 'single_run', label: 'Once for the whole message' }
    ]
  }
];

export class EventTriggerNode extends WorkflowNode {
  static type = 'trigger_event';
  static category = 'trigger';
  static label = 'Event Trigger';
  static description = 'Starts the flow from an external source: an email, a WhatsApp message, a Telegram command or a webhook call.';
  static color = '#f59e0b';
  static fields = [{ key: 'source', label: 'Source', type: 'source' }, ...MATCH_FIELDS];

  static get matchModes() {
    return MatchRule.modes;
  }

  async execute() {
    return NodeResult.continue();
  }
}

export class ManualTriggerNode extends WorkflowNode {
  static type = 'trigger_manual';
  static category = 'trigger';
  static label = 'Manual Trigger';
  static description = 'Starts the flow for every contact you add by hand in the Contacts tab.';
  static color = '#8b5cf6';
  static fields = [
    {
      key: 'status',
      label: 'Pick up contacts with status',
      type: 'select',
      default: 'pending',
      options: ContactRepository.statuses.map((status) => ({ value: status, label: status }))
    }
  ];

  async execute() {
    return NodeResult.continue();
  }
}

export class ScheduleTriggerNode extends WorkflowNode {
  static type = 'trigger_schedule';
  static category = 'trigger';
  static label = 'Schedule';
  static description = 'Starts the flow on a fixed interval, either once per tick or once for every stored contact.';
  static color = '#22c55e';
  static fields = [
    { key: 'every_minutes', label: 'Run every (minutes)', type: 'number', default: '60' },
    {
      key: 'target',
      label: 'Target',
      type: 'select',
      default: 'no_contact',
      options: [
        { value: 'no_contact', label: 'A single run without a contact' },
        { value: 'pending_contacts', label: 'Every pending contact' },
        { value: 'all_contacts', label: 'Every stored contact' }
      ]
    }
  ];

  async execute() {
    return NodeResult.continue();
  }
}
