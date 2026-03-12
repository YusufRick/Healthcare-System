import { MedicationItem, RiskAlert } from "../types";
import { DrugRecord } from "./drugRepository";

export function validateDosage(
  medication: MedicationItem,
  drug: DrugRecord,
  patientAge?: number
): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  if (!medication.dosage) {
    alerts.push({
      type: "dosage",
      severity: "CRITICAL",
      message: `No dosage provided for ${medication.name}`,
    });
    return alerts;
  }

  const prescribedDose = extractDoseMg(medication.dosage);
  const maxDose = extractMaxDoseMg(drug);

  if (prescribedDose !== null && maxDose !== null && prescribedDose > maxDose) {
    alerts.push({
      type: "dosage",
      severity: "CRITICAL",
      message: `Entered dose ${prescribedDose}mg exceeds listed maximum daily dose of ${maxDose}mg for ${medication.name}`,
    });
  }

  if (prescribedDose === null) {
    alerts.push({
      type: "dosage",
      severity: "INFO",
      message: `Could not parse the dosage '${medication.dosage}' for ${medication.name}. Manual review recommended.`,
    });
  }

  if (patientAge && patientAge < 12) {
    alerts.push({
      type: "age",
      severity: "WARNING",
      message: `Use caution prescribing ${medication.name} in paediatric patients`,
    });
  }

  return alerts;
}

function extractDoseMg(doseText?: string): number | null {
  if (!doseText) return null;
  const lower = doseText.toLowerCase();
  const match = lower.match(/(\d+(?:\.\d+)?)\s*(mcg|μg|ug|mg|g)/);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2];
  if (Number.isNaN(value)) return null;
  if (unit === "g") return value * 1000;
  if (unit === "mcg" || unit === "μg" || unit === "ug") return value / 1000;
  return value;
}

function extractMaxDoseMg(drug: DrugRecord): number | null {
  if (drug.max_daily_dose_mg) {
    const parsed = Number(drug.max_daily_dose_mg);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (drug.max_daily_dose) {
    return extractDoseMg(drug.max_daily_dose);
  }
  if (drug.max_daily_dose_text) {
    return extractDoseMg(drug.max_daily_dose_text);
  }
  return null;
}
