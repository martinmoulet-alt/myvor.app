# sync-watch

The V14 relevance worker scans the stored Myvor watch corpus without an age cutoff. Each cycle deliberately mixes the oldest unprocessed items with the newest unprocessed items so recent publications cannot starve historical backfill.

Date is used for scan ordering only, never as a relevance eligibility cutoff. Generic institutional wording (for example `Journal officiel` or `Assemblée nationale`) is not accepted as a discriminating dossier signal by itself.