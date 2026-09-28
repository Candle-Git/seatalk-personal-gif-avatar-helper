import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { manualDocument } from './helpers/manual-dom.mjs';
const source = fs.readFileSync(new URL('../SeaTalk-Personal-GIF-Avatar-Helper.user.js', import.meta.url), 'utf8');
function fixture(attributes = {}) {
  const context = vm.createContext({
    __SPGA_TEST_MODE__: true,
    navigator: { language: 'en', userAgent: 'Mozilla Chrome/140.0.0.0 Safari/537.36', clipboard: {} },
    document: Object.assign(manualDocument(), { documentElement: { getAttribute: key => attributes[key] } }),
    location: { href: 'https://seatalkweb.com/' },
    GM_info: { scriptHandler: 'Tampermonkey', version: '5.4.0', privateField: 'do-not-export' },
    URL, Uint8Array, ArrayBuffer, DataView, Map,
  });
  vm.runInContext(source, context);
  return { api: context.__SPGA_TEST_API__, context };
}
test('environment reads actual version/build and safely handles missing values', () => {
  const { api } = fixture({ 'data-web-semantic-version': '3.70.1', 'data-release-hash': 'cf31f10f2' });
  const e = api.getDiagnosticEnvironment();
  assert.equal(e.seatalk, '3.70.1');
  assert.equal(e.release, 'cf31f10f2');
  assert.equal(e.manager, 'Tampermonkey');
  assert.equal(fixture().api.getDiagnosticEnvironment().seatalk, 'unknown');
  assert.equal(fixture({ 'data-release-hash': 'https://private.test/?token=secret' }).api.getDiagnosticEnvironment().release, 'unknown');
});
test('report excludes raw messages and all selected-resource/user fields', () => {
  const { api } = fixture();
  api.state.selected = { gifId: 'private-gif-identifier', url: 'https://private.test/?token=secret' };
  api.addDiagnostic('user@example.com 123456789 https://private.test/?token=secret', 'error', 'API_ERROR');
  api.addDiagnostic('unstructured-secret-message', 'error');
  const report = api.buildDiagnosticReport();
  for (const forbidden of ['user@example.com', '123456789', 'private.test', 'secret', 'private-gif', 'unstructured']) assert.equal(report.includes(forbidden), false);
  const data = JSON.parse(report);
  assert.equal(data.events.length, 1);
  assert.equal(data.events[0].code, 'API_ERROR');
  assert.equal(data.events[0].stage, 'submit');
  assert.equal(data.events[0].message, 'API returned an error; check Console before retrying');
});
test('stage history retains ordering, bounded size, attempts and nonnegative timing', () => {
  const { api } = fixture();
  for (let i = 0; i < 70; i++) { api.state.diagnosticAttempt = i; api.addDiagnostic('', 'info', 'APPLY_START'); }
  assert.equal(api.state.diagnosticEvents.length, 60);
  const data = JSON.parse(api.buildDiagnosticReport());
  assert.equal(data.events[0].attempt, 10);
  assert.equal(data.events.at(-1).attempt, 69);
  assert.ok(data.events.every(e => e.elapsedMs >= 0));
  api.addDiagnostic('', 'info', 'APPLY_START');
  assert.equal(api.state.diagnosticEvents.length, 60);
});
test('clipboard success copies only report; denial exposes selectable manual fallback', async () => {
  const { api, context } = fixture();
  let copied;
  context.navigator.clipboard.writeText = async value => { copied = value; };
  const button = {};
  await api.copyDiagnosticReport(button);
  assert.equal(JSON.parse(copied).schema, 1);
  assert.equal(context.document.getElementById('seatalk-personal-gif-avatar-report'), null);
  context.navigator.clipboard.writeText = async () => { throw Error('denied'); };
  await api.copyDiagnosticReport(button);
  const dialog = context.document.getElementById('seatalk-personal-gif-avatar-report');
  const output = dialog.querySelector('textarea');
  assert.equal(dialog.open, true);
  assert.equal(context.document.activeElement, output);
  assert.equal(output.selectionEnd, copied.length);
  assert.equal(output.value, copied);
  assert.equal(api.state.manualDiagnosticReport, copied);
  dialog.close();
  assert.equal(api.state.manualDiagnosticReport, '');
  assert.equal(context.document.getElementById('seatalk-personal-gif-avatar-report'), null);
});

test('numeric API error codes survive export; arbitrary error text does not', () => {
  const { api } = fixture();
  api.addDiagnostic('', 'error', 'API_ERROR', 93);
  assert.equal(JSON.parse(api.buildDiagnosticReport()).events[0].errorCode, '93');
  api.state.diagnosticAttempt++;
  api.addDiagnostic('', 'error', 'API_ERROR', 'token=secret');
  assert.equal(JSON.parse(api.buildDiagnosticReport()).events.at(-1).errorCode, null);
});

test('a delayed old clipboard failure cannot overwrite a newer report', async () => {
  const { api, context } = fixture();
  let rejectOld;
  context.navigator.clipboard.writeText = () => new Promise((_resolve, reject) => { rejectOld = reject; });
  const oldCopy = api.copyDiagnosticReport({});
  api.addDiagnostic('', 'error', 'API_ERROR', 93);
  context.navigator.clipboard.writeText = async () => { throw Error('denied'); };
  await api.copyDiagnosticReport({});
  const current = api.state.manualDiagnosticReport;
  rejectOld(Error('late denial'));
  await oldCopy;
  assert.equal(api.state.manualDiagnosticReport, current);
  assert.equal(context.document.getElementById('seatalk-personal-gif-avatar-report').querySelector('textarea').value, current);
});
