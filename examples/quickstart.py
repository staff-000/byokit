# Quickstart example for byokit
# Run after: pip install byokit
import byokit

print("=== byokit Python Quickstart ===\n")

# 1. Get default shortlist (one LIVE model per provider + local)
default_models = byokit.get_models()
print(f"✓ Default shortlist: {len(default_models)} models")
for m in default_models[:4]:
    print(f"  - [{m['providerId']}] {m['name']} ({m['apiModelId']})")

# 2. Query complete catalog
complete = byokit.get_models(byokit.COMPLETE)
print(f"\n✓ Complete catalog: {len(complete)} total models")

# 3. Filter by provider and sort by price
cheap_openai = byokit.get_models({
    "providerIds": [byokit.ProviderId.OPEN_AI],
    "sort": byokit.ModelSort.PRICE_ASCEND,
    "limit": 2,
})
print("\n✓ Top cheapest OpenAI models:")
for m in cheap_openai:
    price = m.get("price", {}).get("input") if m.get("price") else "?"
    print(f"  - {m['name']}: ${price} / 1M input tokens")
