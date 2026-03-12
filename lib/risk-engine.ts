import type { RiskAssessment, RiskAlert } from "./types"
import { DRUG_DATABASE, ALLERGY_DRUG_CLASS_MAP } from "./db"

export function assessRisk(
  medication: string,
  patientAllergies: string[],
  existingMedications: string[] = []
): RiskAssessment {
  const alerts: RiskAlert[] = []
  const drugKey = medication.toLowerCase().replace(/\s+/g, "")

  const drugInfo = DRUG_DATABASE[drugKey]

  // Check allergy conflicts
  if (drugInfo && patientAllergies.length > 0) {
    for (const allergy of patientAllergies) {
      const conflictingDrugs = ALLERGY_DRUG_CLASS_MAP[allergy] || []
      if (conflictingDrugs.includes(drugKey)) {
        alerts.push({
          type: "allergy",
          severity: "high",
          message: `Flagged because the patient is allergic to ${allergy} and the prescribed drug "${drugInfo.name}" belongs to the ${drugInfo.class} drug class, which is associated with ${allergy} allergies.`,
        })
      }
      // Also check drug class name match
      if (drugInfo.class === allergy) {
        const alreadyFlagged = alerts.some(
          (a) => a.type === "allergy" && a.message.includes(allergy)
        )
        if (!alreadyFlagged) {
          alerts.push({
            type: "allergy",
            severity: "high",
            message: `Flagged because the patient is allergic to ${allergy} and the prescribed drug "${drugInfo.name}" is in the ${drugInfo.class} class.`,
          })
        }
      }
    }
  }

  // Check drug-drug interactions
  if (drugInfo && existingMedications.length > 0) {
    for (const existingMed of existingMedications) {
      const existingKey = existingMed.toLowerCase().replace(/\s+/g, "")
      if (drugInfo.interactions.includes(existingKey)) {
        const existingDrugInfo = DRUG_DATABASE[existingKey]
        alerts.push({
          type: "interaction",
          severity: "medium",
          message: `Drug interaction detected: "${drugInfo.name}" may interact with "${existingDrugInfo?.name || existingMed}". This combination may increase the risk of adverse effects. Clinical review is recommended.`,
        })
      }
    }
  }

  // If drug not found in database, add advisory
  if (!drugInfo) {
    alerts.push({
      type: "interaction",
      severity: "low",
      message: `The drug "${medication}" was not found in the database. Unable to perform automated risk checks. Manual review recommended.`,
    })
  }

  // Calculate risk score
  let score = 0
  for (const alert of alerts) {
    if (alert.severity === "high") score += 40
    else if (alert.severity === "medium") score += 20
    else score += 5
  }

  score = Math.min(score, 100)

  let level: RiskAssessment["level"] = "Low"
  if (score >= 60) level = "High"
  else if (score >= 25) level = "Medium"

  return { score, level, alerts }
}

export function assessRiskMultiple(
  medications: string[],
  patientAllergies: string[]
): RiskAssessment {
  const allAlerts: RiskAlert[] = []

  // Check each medication individually for allergy conflicts
  for (const med of medications) {
    const singleResult = assessRisk(med, patientAllergies, [])
    allAlerts.push(...singleResult.alerts)
  }

  // Check drug-drug interactions between the medications
  for (let i = 0; i < medications.length; i++) {
    const others = medications.filter((_, j) => j !== i)
    if (others.length > 0) {
      const interResult = assessRisk(medications[i], [], others)
      for (const alert of interResult.alerts) {
        // Avoid duplicate interaction messages
        const isDuplicate = allAlerts.some(
          (a) => a.type === "interaction" && a.message === alert.message
        )
        if (!isDuplicate) {
          allAlerts.push(alert)
        }
      }
    }
  }

  // Recalculate score
  let score = 0
  for (const alert of allAlerts) {
    if (alert.severity === "high") score += 40
    else if (alert.severity === "medium") score += 20
    else score += 5
  }
  score = Math.min(score, 100)

  let level: RiskAssessment["level"] = "Low"
  if (score >= 60) level = "High"
  else if (score >= 25) level = "Medium"

  return { score, level, alerts: allAlerts }
}
