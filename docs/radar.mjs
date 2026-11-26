
const topics = [
  ['checkout', 'Checkout & payment failures', [
    'checkout payment fails declined card purchase final step', 'charge rejected bank card transaction',
    'unable to pay payment method authorization error', 'card verification loops at checkout',
    'purchase stuck placing order payment gateway', 'checkout spinner order payment timed out',
    'purchase declined credit card online store', 'payment goes through then checkout reports an error',
  ]],
  ['access', 'Account access', [
    'login sign in locked out account', 'password reset email never arrived',
    'cannot log in authentication token expired', 'two factor verification code login',
    'sign in error single sign on session', 'reset forgotten password recovery',
    'cannot access account verification code invalid', 'login keeps redirecting to sign in',
  ]],
  ['shipping', 'Shipping & delivery', [
    'parcel shipment package has not arrived', 'carrier courier tracking link order delivery',
    'tracking number invalid delivery delayed', 'package missing marked delivered',
    'address update shipment courier', 'delivery estimate shipping location',
    'parcel stuck transit shipping status', 'warehouse dispatch tracking shows pending',
  ]],
  ['billing', 'Billing & refunds', [
    'refund reimbursement money back return', 'download invoice receipt tax billing',
    'duplicate charge billed twice bank statement', 'refund pending after returned product',
    'unexpected subscription renewal billing charge', 'cancel subscription recurring invoice',
    'billing statement credit note receipt VAT', 'charged incorrectly refund request',
  ]],
  ['product', 'App issues', [
    'app crashes on startup closes immediately', 'page frozen browser blank screen',
    'dashboard not loading app freezing', 'export download broken attachment',
    'upload file document fails app error', 'search results missing application bug',
    'mobile app update showing blank page', 'export report csv download fails',
  ]],
  ['plan', 'Plans & upgrades', [
    'upgrade plan premium features pricing', 'downgrade subscription plan tier',
    'free trial ends pro license seats', 'add seats to team enterprise plan',
    'plan limits pricing comparison upgrade', 'change subscription tier annual plan',
    'which features available free trial', 'trial extension upgrade license',
  ]],
];

const stop = new Set('a an and are as at be but can cannot could did does for from had has have how i in is it me my no not of on or our please so the their them then this to up us was we were what when where which why will with would you your'.split(' '));
function tokens(text) {
  return (text.toLowerCase().match(/[a-z]{3,}/g) ?? [])
    .filter(word => !stop.has(word))
    .map(word => word.replace(/(?:ing|ed|s)$/u, '') || word);
}

const vocabulary = new Set();
const model = topics.map(([id, name, examples]) => {
  const counts = new Map();
  let total = 0;
  for (const word of tokens(examples.join(' '))) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
    vocabulary.add(word);
    total++;
  }
  return { id, name, counts, total };
});
const unknown = { id: 'other', name: 'Unclassified', terms: [] };
export function classify(text) {
  const words = [...new Set(tokens(text.slice(0, 5000)))].filter(word => vocabulary.has(word)).slice(0, 50);
  if (words.length < 2) return unknown;
  const ranked = model.map(({ id, name, counts, total }) => ({
    id, name,
    terms: words.filter(word => counts.has(word)),
    likelihood: words.reduce((sum, word) => sum + Math.log(((counts.get(word) ?? 0) + 0.5) / (total + vocabulary.size * 0.5)), 0),
  })).sort((a, b) => b.likelihood - a.likelihood);
  const [top, runnerUp] = ranked;
  return top.terms.length >= 2 && top.likelihood - runnerUp.likelihood >= 0.8 ? top : unknown;
}

export const HOUR = 3_600_000;
export const WINDOWS = [3, 6, 12, 24];
export function analyze(tickets, hours = 6) {
  if (!WINDOWS.includes(hours) || !tickets.length) throw new Error('Supply tickets and a 3, 6, 12 or 24 hour window.');
  const enriched = tickets.map(ticket => ({ ...ticket, topic: classify(ticket.subject ?? ''), time: Date.parse(ticket.createdAt) }));
  for (const ticket of enriched) {
    const combined = classify(ticket.text);
    if (combined.id !== 'other') ticket.topic = combined;
  }
  const times = enriched.map(ticket => ticket.time);
  const end = (Math.floor(Math.max(...times) / HOUR) + 1) * HOUR;
  const oldestHour = Math.floor(Math.min(...times) / HOUR) * HOUR;
  const duration = hours * HOUR;
  const start = end - duration;
  const previousPeriods = Math.max(0, Math.min(4, Math.floor((start - oldestHour) / duration)));
  const lower = start - previousPeriods * duration;
  const counts = new Array(hours * (previousPeriods + 1)).fill(0);
  const groups = new Map();
  let recent = 0;
  for (const ticket of enriched) {
    if (ticket.time < lower) continue;
    counts[Math.floor((ticket.time - lower) / HOUR)]++;
    if (!groups.has(ticket.topic.id)) {
      groups.set(ticket.topic.id, { id: ticket.topic.id, name: ticket.topic.name, previous: 0, tickets: [], hourly: new Array(counts.length).fill(0) });
    }
    const group = groups.get(ticket.topic.id);
    group.hourly[Math.floor((ticket.time - lower) / HOUR)]++;
    if (ticket.time >= start) {
      recent++;
      group.tickets.push(ticket);
    } else {
      group.previous++;
    }
  }
  const sorted = [...groups.values()].map(group => {
    const current = group.tickets.length;
    const baseline = previousPeriods ? group.previous / previousPeriods : null;
    const ratio = baseline ? current / baseline : null;
    const flagged = group.id !== 'other' && previousPeriods >= 2 && current >= 4 &&
      current - baseline >= 3 && (baseline === 0 || ratio >= 2);
    group.tickets.sort((a, b) => a.time - b.time);
    return { ...group, current, baseline, ratio, flagged };
  }).filter(group => group.current > 0 || group.previous > 0)
    .sort((a, b) => Number(b.flagged) - Number(a.flagged) ||
      Number(a.id === 'other') - Number(b.id === 'other') ||
      b.current - a.current || b.previous - a.previous || a.name.localeCompare(b.name));
  return { total: tickets.length, unclassified: enriched.filter(ticket => ticket.topic.id === 'other').length,
    hours, previousPeriods, start, end, lower, counts, recent, groups: sorted,
    alerts: sorted.filter(group => group.flagged).length };
}

export function formatNumber(number) {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(number);
}
export function lift(group) {
  if (group.ratio !== null) return formatNumber(group.ratio) + '×';
  return group.baseline === 0 && group.current > 0 ? 'New' : '—';
}
export function incidentBrief(group, result) {
  if (!group.flagged) return '';
  const period = new Date(result.start).toISOString().slice(0, 16) + ' to ' +
    new Date(result.end).toISOString().slice(0, 16) + ' UTC';
  const evidence = group.tickets.slice(0, 5).map(ticket => ticket.id).join(', ');
  const comparison = group.ratio === null ? 'no matching tickets in prior windows' :
    lift(group) + ' the baseline of ' + formatNumber(group.baseline) + ' tickets per window';
  return [
    'Draft incident brief — ' + group.name,
    'Signal: ' + group.current + ' tickets in ' + result.hours + 'h (' + period + '), with ' + comparison + '.',
    'Evidence: ' + evidence + '.',
    'Next step: Have the relevant team verify the pattern against operational data and check the source tickets.',
    'Cause and customer impact are pending verification.',
  ].join('\n');
}
