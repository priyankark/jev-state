import { choice } from '@typesafe-ai/sdk';
import { createTypeSafeClient, reportConnectionError } from '../server/typesafe.js';

if (!process.env.TYPESAFE_API_KEY?.trim()) {
  console.error('Set TYPESAFE_API_KEY in .env.local before running the live smoke check.');
  process.exitCode = 1;
} else {
  try {
    const result = await createTypeSafeClient().systemOne({
      state: { ticket: { message: 'I was charged twice for the same order.' } },
      questions: {
        route: choice('Which team should handle `ticket.message`?', {
          billing: 'Charges, payments, invoices, and refunds',
          technical: 'Software bugs and technical troubleshooting',
          other: 'Requests that do not fit either team',
        }),
      },
    });
    console.log(JSON.stringify({
      model: result.model,
      answer: result.answers.route,
      usage: result.usage,
    }, null, 2));
    if (result.answers.route.choice !== 'billing') {
      console.error('API responded, but the representative billing case needs investigation.');
      process.exitCode = 1;
    }
  } catch (error) {
    reportConnectionError(error);
  }
}
