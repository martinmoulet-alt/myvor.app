# Historical source backfill

The production veille now rescans the complete Myvor watch catalog without an age cutoff and compares new relevant items against older items linked to the same dossier.

A separate targeted Légifrance historical discovery worker was prototyped but is intentionally **not scheduled**: direct public-search requests from the Supabase Edge runtime currently receive HTTP 403. Do not enable this worker until it is routed through an approved source/API bridge (for example an authenticated Légifrance/PISTE integration) and covered by tests.

This directory documents the deferred external backfill only; it does not alter the active v14 historical-corpus scan.