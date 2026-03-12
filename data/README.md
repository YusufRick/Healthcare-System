# Drug data provenance

This folder now contains a normalized formulary file (`drug_reference.csv`) and a structured interaction file (`drug_interaction.csv`) used by the validation layer.

## Intended upstream sources

The schema is designed so the project can be refreshed from public FDA/NLM label data:

- **openFDA drug label API** for dosage, contraindications, warnings, and drug interactions.
- **DailyMed** / SPL data for current label content.

In this environment I could not bulk-fetch every label directly into the repository, so the normalized CSV is a seeded extract based on the project's existing formulary plus fields aligned to FDA label sections.

## Files

- `drug_reference.csv`: one row per drug with max daily dose in mg, contraindications, allergy tags, and interaction names.
- `drug_data.csv`: compatibility export for older code paths.
- `drug_interaction.csv`: pairwise interaction records used by the risk engine.

## Refresh flow

Run:

```bash
node scripts/normalize-drug-data.mjs
```

That script rebuilds `drug_data.csv` and `drug_interaction.csv` from `drug_reference.csv`.
