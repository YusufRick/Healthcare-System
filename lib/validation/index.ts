import { MedicationItem, RiskAssessment, RiskAlert } from "../types";
import { findDrugByName } from "./drugRepository";
import { validateDosage } from "./dosageValidator";
import { checkInteractions } from "./interactionChecker";
import { checkAllergies } from "./allergyChecker";

export function runRiskAssessment(input: {
  medications: MedicationItem[];
  patientAge?: number;
  patientAllergies?: string[];
}): RiskAssessment {
  let alerts: RiskAlert[] = [];

  const resolvedDrugs = input.medications.map((med) => ({
    medication: med,
    drug: findDrugByName(med.name),
  }));

  resolvedDrugs.forEach(({ medication, drug }) => {
    if (!drug) {
      alerts.push({
        type: "interaction",
        severity: "INFO",
        message: `Medication '${medication.name}' is not in the local formulary dataset, so automated checks are incomplete.`,
      });
      return;
    }

    alerts.push(...validateDosage(medication, drug, input.patientAge));
  });

  const knownDrugs = resolvedDrugs.flatMap(({ drug }) => (drug ? [drug] : []));

  alerts.push(...checkInteractions(knownDrugs));
  alerts.push(...checkAllergies(knownDrugs, input.patientAllergies));

  alerts = dedupeAlerts(alerts);
  const score = calculateScore(alerts);

  return {
    alerts,
    score,
    level: convertToRiskLevel(score),
  };
}

function dedupeAlerts(alerts: RiskAlert[]) {
  return alerts.filter((alert, index) => alerts.findIndex((other) => other.message === alert.message) === index);
}

function calculateScore(alerts: RiskAlert[]): number {
  const raw = alerts.reduce((total, alert) => {
    if (alert.severity === "CRITICAL") return total + 35;
    if (alert.severity === "WARNING") return total + 20;
    return total + 5;
  }, 0);

  return Math.min(raw, 100);
}

function convertToRiskLevel(score: number): "Low" | "Medium" | "High" {
  if (score < 20) return "Low";
  if (score < 50) return "Medium";
  return "High";
}
