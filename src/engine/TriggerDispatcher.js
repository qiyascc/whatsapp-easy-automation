import { GraphRouter } from './GraphRouter.js';
import { MatchRule } from '#triggers/MatchRule.js';
import { PhoneNumber } from '#core/PhoneNumber.js';
import { Template } from '#core/Template.js';
import { clamp, toBoolean } from '#core/Support.js';

export class TriggerDispatcher {
  constructor({ repositories, nodeRegistry, triggerRegistry, logger, config }) {
    this.repositories = repositories;
    this.nodes = nodeRegistry;
    this.triggers = triggerRegistry;
    this.logger = logger;
    this.config = config;
  }

  activeSources(workflows) {
    const sources = new Set();
    for (const workflow of workflows) {
      const trigger = new GraphRouter(workflow.graph).triggerOf(this.nodes);
      if (trigger?.type !== 'trigger_event') continue;
      const source = trigger.params?.source;
      if (source && this.triggers.has(source)) sources.add(source);
    }
    return sources;
  }

  primeCursor(workflow) {
    const trigger = new GraphRouter(workflow.graph).triggerOf(this.nodes);
    if (trigger?.type !== 'trigger_event') return;
    const source = trigger.params?.source;
    if (!source || !this.triggers.has(source)) return;
    const key = `cursor:${workflow.id}:${trigger.id}`;
    if (this.repositories.state.get(key) !== null) return;
    this.repositories.state.set(key, String(this.repositories.events.latestId(source)));
  }

  dispatch(workflow) {
    const trigger = new GraphRouter(workflow.graph).triggerOf(this.nodes);
    if (!trigger) return 0;
    if (trigger.type === 'trigger_event') return this.#dispatchEvents(workflow, trigger);
    if (trigger.type === 'trigger_manual') return this.#dispatchManual(workflow, trigger);
    if (trigger.type === 'trigger_schedule') return this.#dispatchSchedule(workflow, trigger);
    return 0;
  }

  simulate(workflow, event) {
    const trigger = new GraphRouter(workflow.graph).triggerOf(this.nodes);
    if (!trigger) return { created: 0, reason: 'The workflow has no trigger node.' };
    if (trigger.type !== 'trigger_event') {
      const created = this.#createRun(workflow, {
        eventId: `test:${Date.now()}`,
        source: 'test',
        sender: event.sender ?? '',
        chat: '',
        name: event.name ?? '',
        text: event.text ?? '',
        command: '',
        args: event.text ?? '',
        data: {}
      }, event.phone ? PhoneNumber.normalize(event.phone) : null);
      return { created: created ? 1 : 0, reason: created ? '' : 'A run for this test already exists.' };
    }

    const synthetic = {
      id: `test:${Date.now()}`,
      source: trigger.params?.source ?? 'test',
      sender: event.sender ?? '',
      chat: '',
      name: event.name ?? null,
      text: event.text ?? '',
      data: { test: true, isGroup: false, subject: event.text ?? '' }
    };
    const match = MatchRule.evaluate(synthetic, trigger.params ?? {});
    if (!match.matched) return { created: 0, reason: 'The sample message does not satisfy the trigger filters.' };
    const created = this.#materialize(workflow, trigger, synthetic, match, event.phone ? [PhoneNumber.normalize(event.phone)].filter(Boolean) : null);
    return { created, reason: created ? '' : 'The trigger matched but produced no contact to run with.' };
  }

  #dispatchEvents(workflow, trigger) {
    const sourceId = trigger.params?.source;
    const source = sourceId ? this.triggers.get(sourceId) : null;
    if (!source) return 0;

    const cursorKey = `cursor:${workflow.id}:${trigger.id}`;
    const stored = this.repositories.state.get(cursorKey);
    if (stored === null) {
      this.repositories.state.set(cursorKey, String(this.repositories.events.latestId(sourceId)));
      return 0;
    }

    const cursor = Number.parseInt(stored, 10) || 0;
    const events = this.repositories.events.readAfter(sourceId, cursor, this.config.eventBatchSize);
    if (!events.length) return 0;

    let created = 0;
    let lastId = cursor;
    for (const event of events) {
      lastId = event.id;
      if (!source.accepts(event, trigger.params ?? {})) continue;
      const match = MatchRule.evaluate(event, trigger.params ?? {});
      if (!match.matched) continue;
      created += this.#materialize(workflow, trigger, event, match, null);
    }
    this.repositories.state.set(cursorKey, String(lastId));
    return created;
  }

  #materialize(workflow, trigger, event, match, overridePhones) {
    const params = trigger.params ?? {};
    const phones = overridePhones ?? this.#extractPhones(params, event);
    const payload = {
      eventId: String(event.id),
      source: event.source,
      sender: event.sender ?? '',
      chat: event.chat ?? '',
      name: event.name ?? '',
      text: event.text ?? '',
      command: match.command ?? '',
      args: match.args ?? '',
      data: event.data ?? {},
      phones
    };

    const shouldCreateContacts = params.extract !== 'none' && phones.length > 0;
    const contacts = [];
    if (shouldCreateContacts) {
      const status = params.contact_status || 'pending';
      for (const phone of phones) {
        const { contact } = this.repositories.contacts.upsert({
          phone,
          name: event.name || null,
          source: event.source,
          status
        });
        if (contact) contacts.push(contact);
      }
    }

    const fanOut = params.fan_out === 'single_run' || params.extract === 'none' || contacts.length === 0 ? 'single_run' : 'per_contact';

    if (fanOut === 'single_run') {
      if (params.extract !== 'none' && params.fan_out === 'per_contact' && contacts.length === 0) return 0;
      const run = this.repositories.runs.create({
        workflowId: workflow.id,
        contactId: contacts[0]?.id ?? null,
        dedupeKey: `event:${event.id}`,
        payload
      });
      return run ? 1 : 0;
    }

    let created = 0;
    for (const contact of contacts) {
      const run = this.repositories.runs.create({
        workflowId: workflow.id,
        contactId: contact.id,
        dedupeKey: `event:${event.id}:${contact.id}`,
        payload: { ...payload, phone: contact.phone, name: contact.name ?? payload.name }
      });
      if (run) created += 1;
    }
    return created;
  }

  #createRun(workflow, payload, phone) {
    let contactId = null;
    if (phone) {
      const { contact } = this.repositories.contacts.upsert({ phone, source: 'test', status: 'pending' });
      contactId = contact?.id ?? null;
    }
    return this.repositories.runs.create({
      workflowId: workflow.id,
      contactId,
      dedupeKey: `${payload.eventId}:${contactId ?? 'none'}`,
      payload
    });
  }

  #extractPhones(params, event) {
    const mode = params.extract || 'text_numbers';
    if (mode === 'none') return [];
    if (mode === 'sender_number') {
      const phone = PhoneNumber.normalize(event.sender);
      return phone ? [phone] : [];
    }
    if (mode === 'payload_field') {
      const value = Template.resolve(params.payload_field || '', event.data ?? {});
      if (Array.isArray(value)) return value.map((entry) => PhoneNumber.normalize(entry)).filter(Boolean);
      const phone = PhoneNumber.normalize(value);
      return phone ? [phone] : [];
    }
    return PhoneNumber.extractAll(event.text, { allowBare: toBoolean(params.allow_bare_numbers, false) });
  }

  #dispatchManual(workflow, trigger) {
    const status = trigger.params?.status || 'pending';
    const contacts = this.repositories.contacts.listByStatus(status, 200).filter((contact) => contact.source === 'manual');
    let created = 0;
    for (const contact of contacts) {
      const run = this.repositories.runs.create({
        workflowId: workflow.id,
        contactId: contact.id,
        dedupeKey: `manual:${contact.id}`,
        payload: {
          eventId: `manual:${contact.id}`,
          source: 'manual',
          sender: contact.phone,
          text: '',
          command: '',
          args: '',
          name: contact.name ?? '',
          data: {},
          phones: [contact.phone]
        }
      });
      if (run) created += 1;
    }
    return created;
  }

  #dispatchSchedule(workflow, trigger) {
    const minutes = clamp(Number.parseInt(trigger.params?.every_minutes ?? '60', 10) || 60, 1, 100000);
    const intervalMs = minutes * 60000;
    const stateKey = `schedule:${workflow.id}:${trigger.id}`;
    const last = this.repositories.state.number(stateKey, 0);
    const now = Date.now();
    if (now - last < intervalMs) return 0;
    this.repositories.state.set(stateKey, String(now));

    const bucket = Math.floor(now / intervalMs);
    const target = trigger.params?.target || 'no_contact';
    const basePayload = {
      eventId: `schedule:${workflow.id}:${bucket}`,
      source: 'schedule',
      sender: '',
      chat: '',
      name: '',
      text: '',
      command: '',
      args: '',
      data: { bucket, scheduledAt: now },
      phones: []
    };

    if (target === 'no_contact') {
      const run = this.repositories.runs.create({
        workflowId: workflow.id,
        contactId: null,
        dedupeKey: basePayload.eventId,
        payload: basePayload
      });
      return run ? 1 : 0;
    }

    const contacts = target === 'pending_contacts'
      ? this.repositories.contacts.listByStatus('pending', 500)
      : this.repositories.contacts.listAll(500);

    let created = 0;
    for (const contact of contacts) {
      const run = this.repositories.runs.create({
        workflowId: workflow.id,
        contactId: contact.id,
        dedupeKey: `${basePayload.eventId}:${contact.id}`,
        payload: { ...basePayload, phone: contact.phone, name: contact.name ?? '', phones: [contact.phone] }
      });
      if (run) created += 1;
    }
    return created;
  }
}
