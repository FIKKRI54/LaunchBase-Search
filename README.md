# LaunchBase Search

A React and Node.js starter for Malaysian location-market analysis. The free workflow combines district statistics with live mapped business supply and exposes the demand–supply calculations. Leaflet and OpenStreetMap provide the interactive analysis map; Google Maps Embed is an optional visual cross-check. All analysis and detailed-report features are free, with clearly labelled Google AdSense placements available to support the service.

## Stack

- React, Vite, Tailwind CSS and Leaflet
- Node.js and Express
- PostgreSQL
- Malaysia Open API and DOSM district datasets
- OpenStreetMap Nominatim geocoding and Overpass market features
- Optional Google Maps Embed API

## Local setup

1. Copy `.env.example` to `.env`.
2. Start your locally installed PostgreSQL service and create a database named `launchbase`. Update `DATABASE_URL` if your username, password, host, port, or database name differs.

   ```text
   DATABASE_URL=postgresql://postgres:your-password@127.0.0.1:5432/launchbase
   ```

3. Create the schema and starter benchmarks:

   ```bash
   npm run db:migrate
   ```

4. Optional: add a browser-restricted Google Embed key to `.env`.

   - Enable only Maps Embed API for the key.
   - Restrict it to your website referrers, including `http://localhost:5173/*`.
   - Set `VITE_GOOGLE_MAPS_EMBED_API_KEY`.

5. Optional: connect an approved Google AdSense account.

   - Create responsive display ad units in AdSense.
   - Set `VITE_GOOGLE_ADSENSE_CLIENT` to your `ca-pub-...` publisher ID.
   - Set `VITE_GOOGLE_ADSENSE_SLOT_LANDING` and `VITE_GOOGLE_ADSENSE_SLOT_ANALYSIS` to the numeric ad-unit slot IDs.
   - Production ads appear only when both a valid publisher ID and slot ID are configured. Development shows labelled placement previews.

6. Start the frontend and API:

   ```bash
   npm run dev
   ```

The frontend runs on `http://localhost:5173`; the API runs on `http://127.0.0.1:8787`.

Without a Google key, the complete interactive analysis remains usable. Users can search from the map, change the radius, click a point to make it the scan centre, and inspect classified competitor markers. A Google Embed key adds place, satellite and Street View tabs. Google results stay inside their iframe and are never read by the backend or used as competitor data.

The PDF download is generated on demand in the browser and is never uploaded to or stored by the API. Every scan is ephemeral and is not retained by the application.

Location searches and map clicks are resolved through Nominatim and matched to the corresponding DOSM administrative district. Nearby businesses are queried from Overpass, categorized from OSM tags and multilingual name evidence, deduplicated by storefront name and proximity, and cached in PostgreSQL. Set `OSM_USER_AGENT` to an identifier containing your contact information before deployment.

Public OpenStreetMap tiles and Nominatim are suitable for normal interactive starter use, but production traffic must follow their usage policies or use a self-hosted/contracted provider. The app does not implement forbidden client-side autocomplete or tile prefetching.

## Open-ended business taxonomy

The classifier is not limited to a hard-coded recommendation list:

- Common `shop`, `amenity`, `craft`, `office`, `healthcare`, `leisure`, and `tourism` values receive curated English/Malay labels.
- An unknown structured value is converted into a readable type automatically. For example, `shop=pet_grooming_supplies` becomes `Pet grooming supplies shop`.
- Semicolon-separated values are retained and combined. `cuisine=italian;pizza` becomes `Italian + pizza restaurant`; both Italian and pizza facets remain available for competitor matching.
- Malay and English name aliases refine vague records such as `shop=yes`.
- Structured tags take precedence over ambiguous brand words.
- Records with no semantic evidence remain visibly broad or unresolved instead of receiving a fabricated type.

The free result returns classification confidence, source, specificity, matching facets, coverage percentage, and every distinct type found in the live scan. The UI initially shows the largest types and provides filtering plus a “show all” control.

## Demographic and cultural-fit safeguards

The DOSM district population snapshot now stores age-band, sex, ethnicity and citizenship shares alongside total population. Age bands affect only categories with a documented audience profile (for example, children for ice cream or seniors for pharmacies). Household spending and poverty can modestly adjust discretionary categories.

Ethnicity is displayed as official aggregate context but is not converted into presumed cuisine demand and is never treated as religion. A pork, alcohol or other restricted-product concept is withheld unless explicit aggregate religion data or strong direct local-market evidence is available. Sex data is shown as an aggregate district fact but does not alter rankings without a category-specific, defensible benchmark. Every applied factor and warning is returned with the recommendation.

## Free analysis algorithm

For each business category:

```text
study population = district population × spatial radius share
potential demand = study population
                 × annual per-capita category spend
                 × household-income factor
                 × category-specific age/audience factor
                 × household-spending and affordability factors
                 × explicit product-suitability constraint
                 × category capture rate

supportable stores = potential demand ÷ average annual store sales
observed competitors = mapped category businesses inside the radius
spatial supply = direct and substitute businesses × category similarity × distance decay
adjusted competitors = max(spatial supply, coverage-adjusted density floor)
new-store fair share = potential demand ÷ (adjusted competitors + 1)
unmet demand = max(0, potential demand - adjusted competitors × average store sales)
```

The planning score weights market gap (25%), demand scale (23%), fair-share viability (18%), household income (12%), competition (12%), and mapped-market evidence (10%). It is not a success probability. A confidence penalty and cap prevent missing or thin map evidence from producing a near-certain score. Each result also includes a range widened for population allocation, cold-start benchmark and mapped-supply uncertainty.

Candidate categories and category-level demand benchmarks are stored in `business_benchmarks`. Category supply and ranking are recalculated for the selected location. The output includes observed supply, distance- and coverage-adjusted supply, evidence tier, uncertainty range, score reasons, risk flags, and a specific testable business format. The model abstains when mapped supply is unusable or category evidence is too thin.

The public scan does not request private operating-cost inputs or present a break-even result. It estimates a transparent new-store revenue range for market screening; users should compare that range with independently verified site and operating costs before investing. Replace the radius-share heuristic with a population grid or small-area geometry when an appropriate Malaysian source is available.

## Outcome validation

Normal public scans and PDFs remain ephemeral. The database includes separate `business_outcomes` and `model_validation_runs` tables for explicitly consented partner data. A category is labelled historically calibrated only when it has a recorded passing spatial/temporal holdout validation—not merely because outcome rows exist.

Validation utilities in `server/services/modelValidation.js` provide revenue error, probability calibration, interval coverage, spatial/temporal splits and baseline gates. Recommended outcomes are monthly sales and 24-month survival. The strict test set must contain both future observations and districts excluded from training.

## API routes

- `GET /api/health`
- `POST /api/analysis/free` — accepts a text `query` or Malaysian `lat`/`lng`; no account required
- `POST /api/model/outcomes` — private bearer-token endpoint for consented partner outcomes; disabled unless `OUTCOME_INGEST_TOKEN` is configured

## Database-first data synchronization

1. An analysis checks `area_statistics` for a non-expired district record.
2. On the first population request, the DOSM file is downloaded once, reduced to current district summaries, and upserted into PostgreSQL.
3. On the first HIES request for a district, the Open API response is inserted into PostgreSQL.
4. Later analyses read stored rows instead of calling the government source.
5. After `MALAYSIA_DATA_CACHE_DAYS` (30 days by default), the next request immediately uses the stored record and starts one deduplicated background refresh.
6. If a refresh fails, the last stored record remains available with a stale-cache warning.

Geocoding is cached for `GEOCODE_CACHE_DAYS`; market features are cached for `MARKET_DATA_CACHE_HOURS`. If market refresh fails, the last stored snapshot is used. With no snapshot, the response clearly labels competitor values as modelled fallback data.

## Production performance

- Concurrent identical scans share one upstream request instead of producing a cache stampede.
- Recent complete analyses are held in a small bounded memory cache; anonymous repeat scans also use a two-minute browser cache.
- Expired government, geocoding and market records use stale-while-refresh behavior within configured safety limits.
- Population and household datasets load in parallel.
- Stored market snapshots carry a normalization version and are not reclassified on every cache hit.
- Storefront deduplication uses name buckets rather than an all-to-all comparison.
- Full market counts drive the analysis, while the interactive-map response is capped and niche-balanced to keep JSON and Leaflet rendering bounded.
- Nginx serves immutable built assets and compresses API JSON.

OCI deployment files and the production checklist are in [`deploy/README-OCI.md`](deploy/README-OCI.md).
