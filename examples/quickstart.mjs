// Quickstart example for byokit
// Run after: npm install byokit
import * as byokit from 'byokit';

console.log('=== byokit JavaScript Quickstart ===\n');

// 1. Get default shortlist (one LIVE model per provider + local)
const defaultModels = byokit.getModels();
console.log(`✓ Default shortlist: ${defaultModels.length} models`);
for (const m of defaultModels.slice(0, 4)) {
  console.log(`  - [${m.providerId}] ${m.name} (${m.apiModelId})`);
}

// 2. Query complete catalog
const complete = byokit.getModels(byokit.COMPLETE);
console.log(`\n✓ Complete catalog: ${complete.length} total models`);

// 3. Filter by provider and sort by price
const cheapOpenAI = byokit.getModels({
  providerIds: [byokit.ProviderId.OpenAI],
  sort: byokit.ModelSort.PriceAscend,
  limit: 2,
});
console.log('\n✓ Top cheapest OpenAI models:');
for (const m of cheapOpenAI) {
  console.log(`  - ${m.name}: $${m.price?.input ?? '?'} / 1M input tokens`);
}
