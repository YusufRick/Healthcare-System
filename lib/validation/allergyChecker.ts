import type { MedicationInput, ValidationIssue } from "@/lib/types"
import {
  DrugRecord,
  getDrugAllergyTags,
  getDrugContraindications,
  tokenizeList,
} from "./drugRepository"

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

export function checkAllergies(
  medication: MedicationInput,
  drug: DrugRecord,
  patientAllergies: string[]
): ValidationIssue[] {
  if (!patientAllergies.length) return []

  const normalizedPatientAllergies = patientAllergies.map((allergy) => normalize(allergy))
  const drugAllergyTags = getDrugAllergyTags(drug)
  const drugContraindications = getDrugContraindications(drug)
  const warningTerms = tokenizeList(
    [drug.warnings, drug.warnings_and_cautions].filter(Boolean).join(" | ")
  )

  const issues: ValidationIssue[] = []

  for (const allergy of normalizedPatientAllergies) {
    const directMatch = drugAllergyTags.some((tag) => tag.includes(allergy) || allergy.includes(tag))
    const contraindicationMatch = drugContraindications.some(
      (entry) => entry.includes(allergy) || allergy.includes(entry)
    )
    const warningMatch = warningTerms.some(
      (entry) => entry.includes(allergy) || allergy.includes(entry)
    )

    if (directMatch || contraindicationMatch || warningMatch) {
      issues.push({
        code: "ALLERGY_CONFLICT",
        severity: "high",
        message: `${medication.name} may conflict with recorded allergy: ${allergy}.`,
        medicationName: medication.name,
      })
    }
  }

  return issues
}