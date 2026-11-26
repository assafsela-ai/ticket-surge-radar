
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 10000;
const columns = {
  date: ['created_at', 'created', 'created_time', 'creation_date', 'created_date', 'created_on', 'date', 'timestamp', 'submitted_at', 'opened_at'],
  subject: ['subject', 'title', 'summary', 'ticket_subject'],
  body: ['body', 'description', 'message', 'text', 'content', 'ticket_description'],
  id: ['ticket_id', 'id', 'ticket_number', 'case_id', 'case_number'],
};
const columnKey = name => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

function parseRows(input, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        field += char;
      }
      continue;
    }
    if (char === delimiter || char === '\n' || char === '\r') {
      row.push(field);
      field = '';
      closedQuote = false;
      if (char !== delimiter) {
        rows.push(row);
        if (rows.length > MAX_ROWS + 1) throw new Error('The file exceeds the 10,000-row limit.');
        row = [];
        if (char === '\r' && input[i + 1] === '\n') i++;
      }
    } else if (char === '"' && !field.length && !closedQuote) {
      quoted = true;
    } else if (closedQuote || char === '"') {
      throw new Error('A CSV field contains an invalid quote.');
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('A quoted CSV field is missing its closing quote.');
  if (field || closedQuote || row.length) rows.push([...row, field]);
  if (rows.length > MAX_ROWS + 1) throw new Error('The file exceeds the 10,000-row limit.');
  return rows;
}

function readDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/i.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour = '00', minute = '00', second = '00', fraction = '', zone = 'Z'] = match;
  const date = Date.parse(year + '-' + month + '-' + day + 'T00:00:00Z');
  if (!Number.isFinite(date) || new Date(date).getUTCDate() !== Number(day) || Number(hour) > 23) return null;
  const parsed = Date.parse(year + '-' + month + '-' + day + 'T' + hour + ':' + minute + ':' + second + fraction + zone);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function importCsv(input) {
  const cleaned = input.replace(/^\uFEFF/, '');
  const header = cleaned.split(/\r\n|\n|\r/, 1)[0];
  const delimiters = [',', ';', '\t'];
  const dialects = delimiters.map(delimiter => ({
    delimiter,
    keys: header.split(delimiter).map(value => columnKey(value.replaceAll('"', ''))),
  }));
  const dialect = dialects.find(({ keys }) => keys.some(key => columns.date.includes(key)) &&
    keys.some(key => columns.subject.includes(key) || columns.body.includes(key)));
  if (!dialect) throw new Error('Include a created_at column and at least one of subject or body.');
  const [headerRow, ...rows] = parseRows(cleaned, dialect.delimiter);
  const keys = headerRow.map(columnKey);
  const indices = Object.fromEntries(Object.entries(columns).map(([kind, aliases]) =>
    [kind, aliases.map(alias => keys.indexOf(alias)).find(index => index >= 0) ?? -1]));
  const ids = new Set();
  const tickets = [];
  let skipped = 0;
  for (const [index, row] of rows.entries()) {
    if (row.every(value => !value.trim())) continue;
    const id = row[indices.id]?.trim();
    const createdAt = readDate(row[indices.date] ?? '');
    const subject = row[indices.subject]?.trim() ?? '';
    const body = row[indices.body]?.trim() ?? '';
    if (row.length !== keys.length || !createdAt || (!subject && !body) || (id && ids.has(id))) {
      skipped++;
      continue;
    }
    if (id) ids.add(id);
    tickets.push({ id: id || 'CSV row ' + (index + 2), createdAt, subject, body, text: [subject, body].filter(Boolean).join(' ') });
  }
  if (!tickets.length) throw new Error('No usable tickets. Use ISO dates such as 2026-11-25T13:00:00Z and include ticket text.');
  return { tickets, skipped };
}
