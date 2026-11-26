
import { stat, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { importCsv, MAX_BYTES } from '../docs/csv.mjs';
import { makeDemo } from '../docs/demo.mjs';
import { analyze, incidentBrief, WINDOWS } from '../docs/radar.mjs';

const usage = 'Usage: node tools/analyze.mjs (--demo | <tickets.csv>) [--window 3|6|12|24] [--include-excerpts]';
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      demo: { type: 'boolean' },
      window: { type: 'string', default: '6' },
      'include-excerpts': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(usage);
  } else {
    const hours = Number(values.window);
    if (!WINDOWS.includes(hours)) throw new Error('The window must be 3, 6, 12 or 24 hours.');
    if (positionals.length !== (values.demo ? 0 : 1)) throw new Error(usage);
    let input = { ...makeDemo(), skipped: 0 };
    if (!values.demo) {
      const path = positionals[0];
      if ((await stat(path)).size > MAX_BYTES) throw new Error('Choose a CSV file that is 10 MB or smaller.');
      input = importCsv(await readFile(path, 'utf8'));
    }
    const result = analyze(input.tickets, hours);
    const topics = result.groups.map(group => ({
      topic: group.name, current: group.current, baseline: group.baseline, lift: group.ratio,
      surge: group.flagged, evidence: group.tickets.slice(0, 5).map(ticket => ({
        id: ticket.id, createdAt: ticket.createdAt,
        ...(values['include-excerpts'] ? { excerpt: ticket.text.slice(0, 200) } : {}),
      })),
      draft: group.flagged ? incidentBrief(group, result) : null,
    }));
    console.log(JSON.stringify({
      source: values.demo ? 'synthetic demo' : 'CSV',
      total: result.total, skipped: input.skipped, unclassified: result.unclassified,
      recent: result.recent, surges: result.alerts, windowHours: hours, priorWindows: result.previousPeriods,
      latestStart: new Date(result.start).toISOString(), latestEndExclusive: new Date(result.end).toISOString(),
      topics,
    }, null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
