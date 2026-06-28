# Firecrawl usage monitor design

## Goal

Add Firecrawl as a first-class usage provider in OmniUsage.

The provider is configured with a Firecrawl API key and polls the Firecrawl usage API. The API key is stored through the existing secret parameter flow and is never committed to the repository.

## Scope

In scope:

- Add `firecrawl` to the runtime provider schema.
- Add a `connectors/firecrawl` poll connector.
- Add Firecrawl to provider ordering and labels.
- Add the official Firecrawl logo from `brand-assets.zip` to renderer vendor logos.
- Add tests for connector mapping, manifest contract, provider ordering, and logo rendering.

Out of scope:

- Historical charts.
- Plan-limit detection if the API does not return a monthly allowance.
- Storing the user-provided API key in source, tests, docs, or fixtures.

## API behavior

Use the documented Firecrawl usage endpoint available from the Firecrawl docs/SDK surface:

- `GET /team/token-usage`
- Auth: `Authorization: Bearer <API_KEY>`
- Response fields:
    - `credits`: credits used by the team
    - `tokens`: tokens used by the team

The connector treats both fields as usage counters. Because this endpoint exposes used credits/tokens but not a monthly quota, observations use `limit: null` and `display_style: "ratio"`. Status remains `normal` because there is no denominator for warning/critical thresholds.

## Connector output

The connector emits up to two observations:

1. `firecrawl:credits-total`
    - label: `积分`
    - used: response `credits`
    - limit: `null`
    - window: `month`
2. `firecrawl:tokens-total`
    - label: `Tokens`
    - used: response `tokens`
    - limit: `null`
    - window: `month`

If a field is missing or non-numeric, it is treated as `0`. If the entire response shape is invalid, the connector throws a clear Firecrawl API format error.

## UI integration

Firecrawl uses the existing provider card, settings form, account list, label-map, refresh interval, and secret handling. No new UI surface is needed.

Provider order: place Firecrawl after Tavily because both are web/search API services.

Logo: extract an official Firecrawl SVG from `brand-assets.zip` into `src/renderer/assets/vendor_logos/firecrawl.svg`, then wire it into `VendorMark` like existing official vendor logos.

## Testing

Follow TDD:

1. Add failing tests first:
    - `tests/integration/connector/firecrawl-connector.test.ts`
    - manifest contract includes Firecrawl API key secret
    - provider schema/order/label tests expect Firecrawl
    - `Icon` test expects Firecrawl official logo rendering
2. Implement connector/schema/UI/logo changes.
3. Run targeted tests, then `pnpm test` before completion.

## Documentation

Update project docs only if they enumerate supported providers or connector list. `CLAUDE.md` core feature list already enumerates providers, so add Firecrawl there during implementation.
