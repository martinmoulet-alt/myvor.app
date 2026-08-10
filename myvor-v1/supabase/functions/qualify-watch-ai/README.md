# qualify-watch-ai

The qualifier validates a deterministic dossier candidate and, for relevant items, compares the item with older texts already linked to the same dossier.

It returns a change classification (`nouveau`, `modification`, `precision`, `application`, `abrogation`, `aucun_changement`, or `indetermine`) and stores the concise delta in the existing `qualification_reason` field as `Ce qui change [...]`.

No UI or schema change is required.