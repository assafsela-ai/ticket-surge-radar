
import { HOUR } from './radar.mjs';

const start = Date.UTC(2026, 10, 24, 10);
const routine = [
  ['Password reset never arrived', 'I cannot log in. I requested a reset email twice.'],
  ['Package marked delivered', 'The courier tracking shows delivered but there is no parcel.'],
  ['Need an invoice copy', 'Can you send a tax receipt for our billing records?'],
  ['App closes when I open it', 'The mobile app crashes on startup after the update.'],
  ['Add seats to our team', 'How many seats do we get if we upgrade to the enterprise plan?'],
  ['Shipment in transit', 'The tracking number has not shown a new delivery estimate.'],
  ['Refund still pending', 'I returned my product last week. When will I get a refund?'],
  ['Verification code expires', 'My sign-in code expires before I can finish login.'],
];
const checkout = [
  ['Card declined at checkout', 'My card works elsewhere. It fails at the final checkout step.'],
  ['I can’t complete my purchase', 'The payment fails right after I confirm the card.'],
  ['Pay button keeps spinning', 'The checkout spinner never stops and the order never completes.'],
  ['Purchase stalls after bank approval', 'The bank approved my card but the checkout page timed out.'],
  ['Transaction rejected with another card', 'Two different cards give the same payment error.'],
  ['No order after clicking Pay', 'The card authorization went through but checkout shows an error.'],
  ['Payment step sends me back', 'I enter card details then the checkout reloads the same page.'],
  ['Repeated verification at checkout', 'The card verification keeps looping so I cannot place the order.'],
  ['Can’t get past the last screen', 'The checkout button says payment failed every time I try.'],
];
const spikeHours = [0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5];

export function makeDemo() {
  const tickets = [];
  function add(hour, minute, [subject, body]) {
    tickets.push({ id: 'TS-' + (1001 + tickets.length), createdAt: new Date(start + hour * HOUR + minute * 60000).toISOString(),
      subject, body, text: subject + ' ' + body });
  }
  for (let hour = 0; hour < 30; hour++) {
    const perHour = 2 + Number((hour * 7) % 10 < 5) - Number(hour === 29);
    for (let index = 0; index < perHour; index++) add(hour, 5 + index * 13, routine[(hour * 3 + index) % routine.length]);
    if (hour < 24 && [1, 4].includes(hour % 6)) add(hour, 52, checkout[hour % checkout.length]);
  }
  const baseline = tickets.length;
  spikeHours.forEach((hour, index) => add(24 + hour, 20 + (index * 11) % 39, checkout[index % checkout.length]));
  return { tickets, baseline };
}

export function demoCsv() {
  const { tickets } = makeDemo();
  const quote = value => '"' + value.replaceAll('"', '""') + '"';
  return ['ticket_id,created_at,subject,body', ...tickets.map(ticket =>
    [ticket.id, ticket.createdAt, ticket.subject, ticket.body].map(quote).join(','))].join('\r\n') + '\r\n';
}
