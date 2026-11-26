
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importCsv } from '../docs/csv.mjs';
import { demoCsv, makeDemo } from '../docs/demo.mjs';
import { analyze, classify, incidentBrief } from '../docs/radar.mjs';

test('the synthetic replay moves from steady state to one evidence-backed surge', () => {
  const { tickets, baseline } = makeDemo();
  assert.equal(baseline, 82);
  assert.equal(analyze(tickets.slice(0, baseline)).alerts, 0);
  const result = analyze(tickets);
  const group = result.groups[0];
  assert.equal(result.total, 100);
  assert.equal(result.alerts, 1);
  assert.equal(group.current, 18);
  assert.equal(group.baseline, 2);
  assert.equal(group.ratio, 9);
  assert.equal(group.hourly.reduce((total, current) => total + current), 26);
  assert.match(incidentBrief(group, result), /TS-1083/);
  assert.deepEqual(analyze(importCsv(demoCsv()).tickets), result);
});

test('CSV aliases, escaped text, UTC normalization and skipped rows', () => {
  const rows = '\uFEFFID;Created At;Title;Description\r\n' +
    'A;2026-11-25T10:00:00+02:00;"Checkout; error";"First line\r\n""Second"" line"\r\n' +
    'A;2026-11-25T11:00:00Z;Duplicate;Skipped\r\n' +
    'B;2026-02-30;Bad date;Skipped\r\n';
  const { tickets, skipped } = importCsv(rows);
  assert.equal(skipped, 2);
  assert.equal(tickets[0].createdAt, '2026-11-25T08:00:00.000Z');
  assert.equal(tickets[0].subject, 'Checkout; error');
  assert.equal(tickets[0].body, 'First line\r\n"Second" line');
  assert.throws(() => importCsv('created_at,body\n2026-11-25,"Unclosed'), /closing quote/);
});

test('short history and unclassified text do not become false alerts', () => {
  const rows = 'created_at,body\n2026-11-25T12:00Z,Unable to pay by card at checkout\n'.replace(/\n$/, '');
  const { tickets } = importCsv(rows);
  assert.equal(analyze(Array(4).fill(tickets[0])).alerts, 0);
  assert.equal(classify('הטקסט הזה בעברית').id, 'other');
});

test('a new topic can trigger with adequate history and a zero baseline', () => {
  const data = importCsv('created_at,body\n2026-11-24T18:00Z,Courier tracking parcel delayed\n' +
    Array.from({ length: 4 }, () => '2026-11-25T12:00Z,Card declined at checkout').join('\n'));
  const result = analyze(data.tickets);
  assert.equal(result.alerts, 1);
  assert.equal(result.groups[0].baseline, 0);
  assert.equal(result.groups[0].ratio, null);
  assert.match(incidentBrief(result.groups[0], result), /no matching tickets/);
});
