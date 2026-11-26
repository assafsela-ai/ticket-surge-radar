
import { analyze, formatNumber, HOUR, incidentBrief, lift } from './radar.mjs';
import { importCsv, MAX_BYTES } from './csv.mjs';
import { makeDemo } from './demo.mjs';

const $ = id => document.getElementById(id);
const demo = makeDemo();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hourCycle: 'h23' });
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
let tickets = demo.tickets.slice(0, demo.baseline);
let dataset = { label: 'Synthetic demo', skipped: 0 };
let result;
let selected = 'checkout';
let expanded = false;
let operation = 0;
let series = [];

function el(tag, content, className) {
  const node = document.createElement(tag);
  if (content !== undefined) node.textContent = content;
  if (className) node.className = className;
  return node;
}
function announce(content) {
  $('announce').textContent = content;
}
function windowText(start, end) {
  const first = date.format(start);
  const last = date.format(end);
  return first + ' ' + clock.format(start) + ' – ' + (first === last ? '' : last + ' ') + clock.format(end) + ' UTC';
}
function setSource(label, nextTickets, skipped = 0) {
  dataset = { label, skipped };
  tickets = nextTickets;
  expanded = false;
}
function selectedGroup() {
  return result.groups.find(group => group.id === selected);
}
function setResult(preferred = selected) {
  result = analyze(tickets, Number($('window').value));
  selected = result.groups.find(group => group.id === preferred)?.id ?? result.groups[0].id;
  $('source').textContent = dataset.label;
  $('total').textContent = formatNumber(result.total);
  $('recent').textContent = formatNumber(result.recent);
  $('alerts').textContent = result.alerts;
  $('alerts').classList.toggle('alerted', result.alerts > 0);
  $('coverage').textContent = formatNumber(result.unclassified) + ' unclassified' +
    (dataset.skipped ? ' · ' + formatNumber(dataset.skipped) + ' skipped' : '');
  $('window-date').textContent = windowText(result.start, result.end);
  $('baseline-label').textContent = result.previousPeriods < 2 ? 'Insufficient baseline' :
    'Compared with ' + result.previousPeriods + ' prior windows';
  renderTopics();
  renderInvestigation();
}

function renderTopics() {
  $('topics').replaceChildren(...result.groups.map(group => {
    const button = el('button', undefined, 'topic-row');
    button.type = 'button';
    button.dataset.topic = group.id;
    button.setAttribute('aria-pressed', String(group.id === selected));
    button.setAttribute('aria-label', group.name + ', ' + group.current + ' tickets, lift ' + lift(group) + (group.flagged ? ', surge detected' : ''));
    const name = el('span', undefined, 'topic-label');
    if (group.flagged) {
      const marker = el('i', undefined, 'signal-mark');
      marker.setAttribute('aria-hidden', 'true');
      name.append(marker);
    }
    name.append(group.name);
    button.append(name, el('span', formatNumber(group.current)), el('span', lift(group), 'lift'));
    return button;
  }));
}

function renderEvidence(group) {
  $('evidence').replaceChildren(...group.tickets.slice(0, expanded ? group.tickets.length : 5).map(ticket => {
    const item = el('li');
    const time = new Date(ticket.time);
    item.append(el('span', ticket.id + ' · ' + date.format(time) + ' ' + clock.format(time) + ' UTC', 'ticket-meta'));
    if (ticket.subject) item.append(el('strong', ticket.subject));
    if (ticket.body) item.append(el('p', ticket.body));
    return item;
  }));
  $('more').hidden = group.tickets.length <= 5;
  $('more').textContent = expanded ? 'Show first 5 tickets' : 'Show all ' + group.tickets.length + ' tickets';
  $('evidence-empty').hidden = group.tickets.length > 0;
}

function renderInvestigation() {
  const group = selectedGroup();
  $('investigation-title').textContent = group.name;
  const status = $('investigation-state');
  status.textContent = group.flagged ? 'Surge detected' : group.id === 'other' ? 'Unclassified' : 'Below threshold';
  if (group.id !== 'other' && result.previousPeriods < 2) status.textContent = 'Insufficient baseline';
  status.classList.toggle('flag', group.flagged);
  $('comparison').textContent = formatNumber(group.current) + ' tickets in the latest ' + result.hours + 'h' +
    (group.baseline === null ? '.' : ' · ' + formatNumber(group.baseline) + ' per prior window on average.');
  renderEvidence(group);
  const brief = incidentBrief(group, result);
  $('brief-empty').hidden = Boolean(brief);
  $('copy').hidden = !brief;
  $('brief-text').hidden = !brief;
  $('brief-text').textContent = brief;
  $('copy-status').textContent = '';
  $('chart-topic').textContent = group.name;
  series = group.hourly;
  $('chart-caption').textContent = windowText(result.start, result.end) + ' · Shaded area marks the latest window.';
  renderHourly(group);
  drawChart();
}
function renderHourly(group) {
  const table = el('table');
  table.setAttribute('aria-label', 'Hourly ticket volume in UTC');
  const header = table.createTHead().insertRow();
  for (const label of ['Hour (UTC)', 'All tickets', group.name]) {
    const heading = el('th', label);
    heading.scope = 'col';
    header.append(heading);
  }
  const body = table.createTBody();
  result.counts.forEach((count, index) => {
    const time = result.lower + HOUR * index;
    const row = body.insertRow();
    for (const value of [date.format(time) + ' ' + clock.format(time), count, series[index]]) {
      row.insertCell().textContent = value;
    }
  });
  $('hourly').replaceChildren(table);
}

function drawChart() {
  const canvas = $('chart');
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!result || width < 20 || height < 20) return;
  const pixelRatio = devicePixelRatio || 1;
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(pixelRatio, pixelRatio);
  const left = 27, right = width - 7, top = 15, bottom = height - 24;
  const length = result.counts.length;
  const step = (right - left) / length;
  const x = index => left + (index + 0.5) * step;
  const increment = Math.max(1, Math.ceil(Math.max(...result.counts) / 4));
  const y = value => bottom - value * (bottom - top) / (increment * 4);
  const latest = left + (length - result.hours) * step;
  ctx.fillStyle = '#e9f0dc';
  ctx.fillRect(latest, top, right - latest, bottom - top);
  ctx.font = '10px Consolas, monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const value = i * increment;
    ctx.strokeStyle = '#dbe1d5';
    ctx.beginPath();
    ctx.moveTo(left, y(value));
    ctx.lineTo(right, y(value));
    ctx.stroke();
    ctx.fillStyle = '#535e50';
    ctx.fillText(String(value), left - 6, y(value) + 3);
  }
  for (const [values, color, lineWidth] of [[result.counts, '#273a2c', 2], [series, '#648d27', 2.7]]) {
    ctx.beginPath();
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    values.forEach((value, i) => i ? ctx.lineTo(x(i), y(value)) : ctx.moveTo(x(i), y(value)));
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  for (let i = 0; i < length; i += Math.max(1, Math.ceil(length / (width > 500 ? 8 : 4)))) {
    ctx.fillText(clock.format(result.lower + i * HOUR), Math.max(19, Math.min(width - 17, x(i))), height - 6);
  }
}

$('topics').addEventListener('click', event => {
  const button = event.target.closest('button[data-topic]');
  if (!button) return;
  selected = button.dataset.topic;
  for (const row of $('topics').children) row.setAttribute('aria-pressed', String(row === button));
  expanded = false;
  renderInvestigation();
  announce('Showing evidence for ' + selectedGroup().name + '.');
});
$('window').addEventListener('change', () => {
  expanded = false;
  setResult();
  announce('Window updated to ' + result.hours + ' hours. Surges detected: ' + result.alerts + '.');
});
$('more').addEventListener('click', () => {
  expanded = !expanded;
  renderEvidence(selectedGroup());
});
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('brief-text').textContent);
    $('copy-status').textContent = 'Draft copied.';
  } catch {
    $('copy-status').textContent = 'Select and copy the draft text.';
  }
});

$('replay').addEventListener('click', async () => {
  const run = ++operation;
  $('file-error').hidden = true;
  $('replay-label').textContent = 'Running demo…';
  $('replay').disabled = true;
  $('window').value = '6';
  setSource('Synthetic demo', demo.tickets.slice(0, demo.baseline));
  setResult('checkout');
  $('radar-graphic').classList.remove('is-scanning');
  void $('radar-graphic').offsetWidth;
  $('radar-graphic').classList.add('is-scanning');
  if (!reduceMotion.matches) await new Promise(resolve => setTimeout(resolve, 700));
  if (run !== operation) return;
  $('window').value = '6';
  setSource('Synthetic demo', demo.tickets);
  setResult('checkout');
  $('replay-label').textContent = 'Replay demo';
  $('replay').disabled = false;
  announce('Demo complete. Checkout and payment failures surged to 18 tickets. The incident draft is ready.');
});

$('upload').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const run = ++operation;
  $('replay').disabled = false;
  if ($('replay-label').textContent === 'Running demo…') $('replay-label').textContent = 'Run demo';
  $('file-error').hidden = true;
  announce('Reading ' + file.name + '.');
  try {
    if (file.size > MAX_BYTES) throw new Error('Choose a CSV file that is 10 MB or smaller.');
    const raw = await file.text();
    if (run !== operation) return;
    const imported = importCsv(raw);
    setSource(file.name, imported.tickets, imported.skipped);
    setResult(null);
    announce('Loaded ' + result.total + ' tickets. Skipped ' + imported.skipped + ' rows. Surges detected: ' + result.alerts + '.');
  } catch (error) {
    if (run !== operation) return;
    $('file-error').hidden = false;
    $('file-error').textContent = error.message;
  }
});

setResult();
new ResizeObserver(drawChart).observe($('chart'));
