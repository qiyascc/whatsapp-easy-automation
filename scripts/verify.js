import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Application } from '#app';
import { PhoneNumber } from '#core/PhoneNumber.js';
import { MatchRule } from '#triggers/MatchRule.js';
import { GraphRouter } from '#engine/GraphRouter.js';
import { Template } from '#core/Template.js';

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-verify-'));
const results = [];

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, reason: error.message });
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, reason: error.message });
  }
}

check('phone numbers survive separators and adjacency', () => {
  assert.deepEqual(PhoneNumber.extractAll('+90 532 111 22 33'), ['905321112233']);
  assert.deepEqual(PhoneNumber.extractAll('+994501234567 994559876543', { allowBare: true }), ['994501234567', '994559876543']);
  assert.deepEqual(PhoneNumber.extractAll('905321112233'), []);
  assert.equal(PhoneNumber.normalize('+1 (202) 555-0143'), '12025550143');
});

check('command matching extracts arguments', () => {
  const event = { sender: 'ops@shop.com', text: '/add +994501234567 please' };
  const outcome = MatchRule.evaluate(event, { match_mode: 'command', match_value: '/add', sender_filter: 'ops@shop.com' });
  assert.equal(outcome.matched, true);
  assert.equal(outcome.args, '+994501234567 please');
  const blocked = MatchRule.evaluate(event, { match_mode: 'command', match_value: '/add', sender_filter: 'someone@else.com' });
  assert.equal(blocked.matched, false);
});

check('branching never falls back to the wrong edge', () => {
  const router = new GraphRouter({
    nodes: [{ id: 'a', type: 'check_joined' }, { id: 'b', type: 'group_add' }],
    edges: [{ from: 'a', to: 'b', out: 'false' }]
  });
  assert.equal(router.next('a', 'false'), 'b');
  assert.equal(router.next('a', 'true'), null);
});

check('templates resolve nested payload values', () => {
  const scope = Template.buildScope({
    contact: { phone: '994501234567', name: 'Ada' },
    payload: { text: 'hello', data: { order: { id: 42 } } },
    variables: { response: { status: 200 } }
  });
  assert.equal(Template.render('{{name}} {{payload.order.id}} {{vars.response.status}}', scope), 'Ada 42 200');
  assert.equal(Template.render('{{unknown.thing}}', scope), '');
});

const application = await Application.create({
  DATA_DIR: path.join(workspace, 'data'),
  SESSIONS_DIR: path.join(workspace, 'sessions'),
  LOG_LEVEL: 'error',
  AUTH_TOKEN: 'verify-token'
});
const { repositories, services, dispatcher, nodeRegistry, validator } = application.container;

check('storage layer is available', () => {
  assert.ok(['better-sqlite3', 'node:sqlite'].includes(application.database.driver));
  assert.equal(repositories.settings.get('pacing_min_seconds'), '20');
});

check('secrets never round trip in plain text', () => {
  repositories.settings.setSecret('mail_password', 'super-secret');
  assert.equal(repositories.settings.secret('mail_password'), 'super-secret');
  assert.equal(repositories.settings.hasSecret('mail_password'), true);
  assert.equal(repositories.settings.all().mail_password, undefined);
});

check('an invalid graph cannot be enabled', () => {
  assert.throws(
    () => services.workflows.create({ name: 'broken', graph: { nodes: [], edges: [] }, enabled: true }),
    (error) => error.code === 'invalid_graph'
  );
});

const workflowId = services.workflows.create({
  name: 'Mail command to invite',
  enabled: true,
  graph: {
    nodes: [
      {
        id: 't1',
        type: 'trigger_event',
        params: {
          source: 'mail',
          match_mode: 'command',
          match_value: '/add',
          extract: 'text_numbers',
          fan_out: 'per_contact',
          contact_status: 'pending'
        },
        x: 20,
        y: 20
      },
      { id: 'n1', type: 'send_text', params: { text: 'Hello {{phone}}' }, x: 20, y: 140 },
      { id: 'n2', type: 'group_send_text', params: { group_jid: '123@g.us', text: 'new member' }, x: 20, y: 260 }
    ],
    edges: [
      { from: 't1', to: 'n1', out: 'default' },
      { from: 'n1', to: 'n2', out: 'default' }
    ]
  }
});

check('workflow validation accepts a complete graph', () => {
  const workflow = services.workflows.get(workflowId);
  assert.equal(workflow.enabled, true);
  assert.equal(validator.validate(workflow.graph).valid, true);
});

check('event dispatch fans out to one run per contact', () => {
  const workflow = services.workflows.get(workflowId);
  dispatcher.dispatch(workflow);
  repositories.events.append({
    source: 'mail',
    externalId: 'verify-1',
    sender: 'ops@shop.com',
    text: '/add +994501234567 +994559876543',
    data: { subject: 'signup' }
  });
  const created = dispatcher.dispatch(workflow);
  assert.equal(created, 2);
  const runs = repositories.runs.list({ workflowId });
  assert.equal(runs.length, 2);
  assert.equal(runs.every((run) => run.contactId !== null), true);
  assert.equal(repositories.contacts.statusCounts().pending, 2);
});

check('the same event never produces duplicate runs', () => {
  const workflow = services.workflows.get(workflowId);
  assert.equal(dispatcher.dispatch(workflow), 0);
});

check('non matching commands are ignored', () => {
  const workflow = services.workflows.get(workflowId);
  repositories.events.append({ source: 'mail', externalId: 'verify-2', sender: 'ops@shop.com', text: 'hello there' });
  assert.equal(dispatcher.dispatch(workflow), 0);
});

check('run scoped nodes are claimed once per event', () => {
  const runs = repositories.runs.list({ workflowId });
  const eventId = runs[0].payload.eventId;
  const key = `once:${workflowId}:n2:${eventId}`;
  assert.equal(repositories.state.get(key), null);
  repositories.state.set(key, String(Date.now()));
  assert.notEqual(repositories.state.get(key), null);
});

check('contacts can be pasted, filtered and paged', () => {
  const outcome = services.contacts.addFromText('+994551110022, 994551110033\n+994551110044');
  assert.equal(outcome.parsed, 3);
  assert.equal(outcome.added, 3);
  const all = services.contacts.list({});
  assert.equal(all.total >= 3, true);
  assert.equal(all.contacts.length <= 50, true);
  const filtered = services.contacts.list({ status: 'pending', search: '994551110022', limit: 10, offset: 0 });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.contacts[0].source, 'manual');
  const paged = services.contacts.list({ limit: 1, offset: 1 });
  assert.equal(paged.contacts.length, 1);
});

check('api keys are hashed, verified and revocable', () => {
  const issued = services.apiKeys.issue({ name: 'verify', scopes: ['webhook'] });
  assert.match(issued.key, /^wak_live_/);
  const principal = services.apiKeys.authenticate(issued.key);
  assert.deepEqual(principal.scopes, ['webhook']);
  assert.equal(services.apiKeys.authenticate('wak_live_wrong'), null);
  services.apiKeys.revoke(issued.id);
  assert.equal(services.apiKeys.authenticate(issued.key), null);
  assert.equal(services.apiKeys.authenticate('verify-token').scopes.includes('admin'), true);
});

check('webhook payloads become trigger events', () => {
  const outcome = application.container.ingest.webhook().accept({
    keyId: 1,
    keyName: 'verify',
    keyPrefix: 'wak_live_ab',
    body: { phone: '+994501112233', name: 'Ada', text: '/add' },
    requestId: 'req-1'
  });
  assert.equal(outcome.accepted, true);
  const events = repositories.events.readAfter('webhook', 0, 10);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data.phones, ['994501112233']);
});

check('contact deletion cascades to runs', () => {
  const runs = repositories.runs.list({ workflowId });
  const target = runs[0];
  repositories.contacts.delete(target.contactId);
  assert.equal(repositories.runs.find(target.id), null);
});

check('deleting a workflow removes its runs', () => {
  services.workflows.remove(workflowId);
  assert.equal(repositories.runs.list({ workflowId }).length, 0);
});

check('every catalog node exposes an executable class', () => {
  for (const definition of nodeRegistry.describeAll()) {
    assert.ok(nodeRegistry.instanceOf(definition.type), `${definition.type} has no instance`);
    assert.ok(['contact', 'run'].includes(definition.scope), `${definition.type} has an invalid scope`);
    assert.ok(Array.isArray(definition.fields), `${definition.type} has no fields`);
  }
});

await checkAsync('http surface answers without leaking secrets', async () => {
  const server = application.http.build();
  const listener = server.listen(0);
  await new Promise((resolve) => listener.once('listening', resolve));
  const base = `http://127.0.0.1:${listener.address().port}`;
  try {
    const status = await fetch(`${base}/api/auth/status`).then((response) => response.json());
    assert.equal(status.authRequired, true);

    const denied = await fetch(`${base}/api/settings`);
    assert.equal(denied.status, 401);

    const allowed = await fetch(`${base}/api/settings`, { headers: { 'X-Api-Key': 'verify-token' } });
    const payload = await allowed.json();
    assert.equal(allowed.status, 200);
    assert.equal(payload.secrets.mail_password, true);
    assert.equal(payload.settings.mail_password, undefined);

    const headers = allowed.headers.get('content-security-policy');
    assert.match(headers, /script-src 'self'/);

    const traversal = await fetch(`${base}/api/sessions/..%2F..%2Fdata`, {
      method: 'DELETE',
      headers: { 'X-Api-Key': 'verify-token' }
    });
    assert.equal(traversal.status, 400);
    assert.equal(fs.existsSync(path.join(workspace, 'data')), true);
  } finally {
    await new Promise((resolve) => listener.close(resolve));
  }
});

application.database.close();
fs.rmSync(workspace, { recursive: true, force: true });

const failures = results.filter((result) => !result.ok);
for (const result of results) {
  process.stdout.write(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.ok ? '' : ` -> ${result.reason}`}\n`);
}
process.stdout.write(`\n${results.length - failures.length}/${results.length} checks passed\n`);
process.exit(failures.length ? 1 : 0);
