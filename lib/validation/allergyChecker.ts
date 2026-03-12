import { RiskAlert } from "../types";
import { DrugRecord, getDrugAllergyTags, getDrugContraindications, tokenizeList } from "./drugRepository";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesAnyTerm(haystack: string[], needle: string) {
  const target = normalize(needle);
  return haystack.some((term) => term === target || term.includes(target) || target.includes(term));
}

export function checkAllergies(
  prescribedDrugs: DrugRecord[],
  patientAllergies?: string[]
): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  if (!patientAllergies || patientAllergies.length === 0) {
    return alerts;
  }

  const normalizedAllergies = patientAllergies.flatMap((allergy) => tokenizeList(allergy));

  prescribedDrugs.forEach((drug) => {
    const allergyTags = getDrugAllergyTags(drug);
    const contraindications = getDrugContraindications(drug);

    normalizedAllergies.forEach((allergy) => {
      const allergyMatch = matchesAnyTerm(allergyTags, allergy);
      const contraindicationMatch = matchesAnyTerm(contraindications, allergy);

      if (allergyMatch || contraindicationMatch) {
        alerts.push({
          type: "allergy",
          severity: "CRITICAL",
          message: `Potential allergy conflict: ${drug.name} is tagged for ${allergy} sensitivity or lists it as a contraindication.`,
        });
      }
    });
  });

  return dedupeAlerts(alerts);
}

function dedupeAlerts(alerts: RiskAlert[]) {
  return alerts.filter((alert, index) => alerts.findIndex((other) => other.message === alert.message) === index);
}
