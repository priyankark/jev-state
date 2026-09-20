import { createTypeSafeClient, reportConnectionError } from '../server/typesafe.js';

if (!process.env.TYPESAFE_API_KEY?.trim()) {
  console.error('Local dependencies are installed; account setup is incomplete. Set TYPESAFE_API_KEY in .env.local.');
  process.exitCode = 1;
} else {
  try {
    const client = createTypeSafeClient();
    const result = await client.models.list();
    console.log('TypeSafe authentication verified. Available model aliases:');
    for (const model of result) console.log(`- ${model.name}`);
    console.log(`Configured model: ${process.env.TYPESAFE_DEFAULT_MODEL || 'jev-latest'}`);
    console.log('Run npm run smoke:jev to verify one small inference request.');
  } catch (error) {
    reportConnectionError(error);
  }
}
