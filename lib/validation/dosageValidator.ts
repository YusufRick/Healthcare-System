import type { MedicationInput, ValidationIssue } from "@/lib/types"
import { DrugRecord } from "./drugRepository"

function normalizeUnit(unit: string) {
  return unit.toLowerCase().replace("μg", "mcg").replace("ug", "mcg")
}

function convertToMg(value: number, unit: string) {
  const normalized = normalizeUnit(unit)
  if (normalized === "mg") return value
  if (normalized === "g") return value * 1000
  if (normalized === "mcg") return value / 1000
  return null
}

function parseDose(value: string): { amount: number; unit: string } | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(mcg|μg|ug|mg|g)$/i)
  if (!match) return null

  return {
    amount: Number(match[1]),
    unit: match[2],
  }
}

function extractMaxDoseFromLabelText(text?: string): number | null {
  if (!text) return null

  const patterns = [
    /maximum daily dose(?: of)?\s*(\d+(?:\.\d+)?)\s*(mcg|μg|ug|mg|g)/i,
    /do not exceed\s*(\d+(?:\.\d+)?)\s*(mcg|μg|ug|mg|g)/i,
    /max(?:imum)?(?: daily)? dose(?: of)?\s*(\d+(?:\.\d+)?)\s*(mcg|μg|ug|mg|g)/i,
    /not exceed\s*(\d+(?:\.\d+)?)\s*(mcg|μg|ug|mg|g)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue

    const value = Number(match[1])
    const unit = match[2]
    const mg = convertToMg(value, unit)
    if (mg !== null) return mg
  }

  return null
}

function extractMaxDoseMg(drug: DrugRecord): number | null {
  if (drug.max_daily_dose_mg) {
    const value = Number(drug.max_daily_dose_mg)
    if (!Number.isNaN(value)) return value
  }

  if (drug.max_daily_dose) {
    const parsed = parseDose(drug.max_daily_dose)
    if (parsed) {
      return convertToMg(parsed.amount, parsed.unit)
    }
  }

  if (drug.max_daily_dose_text) {
    return extractMaxDoseFromLabelText(drug.max_daily_dose_text)
  }

  return null
}

export function validateDosage(medication: MedicationInput, drug: DrugRecord): ValidationIssue | null {
  const prescribed = parseDose(medication.dosage)
  if (!prescribed) return null

  const prescribedMg = convertToMg(prescribed.amount, prescribed.unit)
  if (prescribedMg === null) return null

  const maxDoseMg = extractMaxDoseMg(drug)
  if (maxDoseMg === null) return null

  if (prescribedMg <= maxDoseMg) return null

  return {
    code: "DOSAGE_EXCEEDS_MAX",
    severity: "high",
    message: `${medication.name} dosage (${medication.dosage}) exceeds the maximum known daily dose.`,
    medicationName: medication.name,
  }
}