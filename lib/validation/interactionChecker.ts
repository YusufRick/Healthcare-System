import fs from "fs"
import path from "path"
import { parse } from "csv-parse/sync"
import type { MedicationInput, ValidationIssue } from "@/lib/types"
import { DrugRecord, getDrugInteractions } from "./drugRepository"

interface InteractionRecord {
  drug_a: string
  drug_b: string
  severity: "low" | "medium" | "high"
  description: string
}

let cachedInteractions: InteractionRecord[] | null = null

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function readInteractionCsv(): InteractionRecord[] {
  const filePath = path.join(process.cwd(), "data", "drug_interaction.csv")
  if (!fs.existsSync(filePath)) return []

  const fileContent = fs.readFileSync(filePath, "utf-8")
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  })

  return records as InteractionRecord[]
}

function getAllInteractions(): InteractionRecord[] {
  if (!cachedInteractions) {
    cachedInteractions = readInteractionCsv()
  }
  return cachedInteractions
}

function namesMatch(a: string, b: string) {
  return normalize(a) === normalize(b)
}

function getComparableNames(drug: DrugRecord): string[] {
  return [drug.name, drug.generic_name, ...(drug.brand_names || [])]
    .filter(Boolean)
    .map((value) => value!)
}

function findInteraction(drugA: DrugRecord, drugB: DrugRecord): InteractionRecord | undefined {
  const aNames = getComparableNames(drugA)
  const bNames = getComparableNames(drugB)

  return getAllInteractions().find((entry) => {
    return (
      aNames.some((a) => namesMatch(entry.drug_a, a)) &&
      bNames.some((b) => namesMatch(entry.drug_b, b))
    ) || (
      aNames.some((a) => namesMatch(entry.drug_b, a)) &&
      bNames.some((b) => namesMatch(entry.drug_a, b))
    )
  })
}

export function checkInteractions(
  medicationA: MedicationInput,
  drugA: DrugRecord,
  medicationB: MedicationInput,
  drugB: DrugRecord
): ValidationIssue | null {
  const csvInteraction = findInteraction(drugA, drugB)
  if (csvInteraction) {
    return {
      code: "DRUG_INTERACTION",
      severity: csvInteraction.severity,
      message: `${medicationA.name} and ${medicationB.name}: ${csvInteraction.description}`,
      medicationName: `${medicationA.name}, ${medicationB.name}`,
    }
  }

  const drugAInteractions = getDrugInteractions(drugA)
  const drugBInteractions = getDrugInteractions(drugB)

  const drugANames = getComparableNames(drugA)
  const drugBNames = getComparableNames(drugB)

  const fallbackMatch =
    drugAInteractions.some((entry) => drugBNames.some((name) => namesMatch(entry, name))) ||
    drugBInteractions.some((entry) => drugANames.some((name) => namesMatch(entry, name)))

  if (!fallbackMatch) return null

  return {
    code: "DRUG_INTERACTION",
    severity: "medium",
    message: `${medicationA.name} may interact with ${medicationB.name}. Review combination before dispensing.`,
    medicationName: `${medicationA.name}, ${medicationB.name}`,
  }
}