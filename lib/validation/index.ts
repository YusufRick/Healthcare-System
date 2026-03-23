import type { PrescriptionInput, RiskAssessmentResult, ValidationIssue } from "@/lib/types"
import { checkAllergies } from "./allergyChecker"
import { validateDosage } from "./dosageValidator"
import { findDrugByName } from "./drugRepository"
import { checkInteractions } from "./interactionChecker"

function severityScore(severity: ValidationIssue["severity"]) {
  switch (severity) {
    case "low":
      return 1
    case "medium":
      return 2
    case "high":
      return 3
    default:
      return 0
  }
}

export async function runRiskAssessment(input: PrescriptionInput): Promise<RiskAssessmentResult> {
  const issues: ValidationIssue[] = []

  const resolvedDrugs = await Promise.all(
    input.medications.map(async (medication) => ({
      medication,
      drug: await findDrugByName(medication.name),
    }))
  )

  for (const { medication, drug } of resolvedDrugs) {
    if (!drug) {
      issues.push({
        code: "DRUG_NOT_FOUND",
        severity: "medium",
        message: `Medication '${medication.name}' was not found in OpenFDA or the local fallback dataset, so automated checks are incomplete.`,
        medicationName: medication.name,
      })
      continue
    }

    const dosageIssue = validateDosage(medication, drug)
    if (dosageIssue) {
      issues.push(dosageIssue)
    }

    const allergyIssues = checkAllergies(medication, drug, input.patientAllergies || [])
    issues.push(...allergyIssues)
  }

  for (let i = 0; i < resolvedDrugs.length; i += 1) {
    for (let j = i + 1; j < resolvedDrugs.length; j += 1) {
      const a = resolvedDrugs[i]
      const b = resolvedDrugs[j]

      if (!a.drug || !b.drug) continue

      const interactionIssue = checkInteractions(a.medication, a.drug, b.medication, b.drug)
      if (interactionIssue) {
        issues.push(interactionIssue)
      }
    }
  }

  const highestSeverity = issues.reduce<ValidationIssue["severity"]>(
    (current, issue) => (severityScore(issue.severity) > severityScore(current) ? issue.severity : current),
    "low"
  )

  return {
    issues,
    status: issues.length === 0 ? "safe" : highestSeverity === "high" ? "unsafe" : "review",
  }
}