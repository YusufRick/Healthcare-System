import fs from "fs"
import path from "path"
import { parse } from "csv-parse/sync"

export interface DrugRecord {
  name: string
  generic_name?: string
  brand_names?: string[]
  drug_class?: string
  max_daily_dose?: string
  max_daily_dose_mg?: string
  max_daily_dose_text?: string
  contraindications: string
  allergy_tags?: string
  interactions?: string
  warnings?: string
  warnings_and_cautions?: string
  source?: "openfda" | "csv"
}

type OpenFDALabelResult = {
  openfda?: {
    brand_name?: string[]
    generic_name?: string[]
    substance_name?: string[]
    pharm_class_epc?: string[]
  }
  contraindications?: string[]
  drug_interactions?: string[]
  warnings?: string[]
  warnings_and_cautions?: string[]
  dosage_and_administration?: string[]
}

let cachedDrugs: DrugRecord[] | null = null

function readCsv(fileName: string): DrugRecord[] {
  const filePath = path.join(process.cwd(), "data", fileName)
  const fileContent = fs.readFileSync(filePath, "utf-8")

  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  })

  return (records as DrugRecord[]).map((record) => ({
    ...record,
    brand_names: normalizeBrandNames(record.brand_names),
    source: "csv",
  }))
}

function loadCSV(): DrugRecord[] {
  const preferred = path.join(process.cwd(), "data", "drug_reference.csv")
  if (fs.existsSync(preferred)) {
    return readCsv("drug_reference.csv")
  }
  return readCsv("drug_data.csv")
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function normalizeBrandNames(value?: string[] | string): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.map((v) => v.trim()).filter(Boolean)

  return value
    .split(/[|,;]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function tokenizeList(value?: string): string[] {
  if (!value) return []
  return value
    .split(/[|,;]/)
    .map((item) => normalize(item))
    .filter(Boolean)
}

export function getAllDrugs(): DrugRecord[] {
  if (!cachedDrugs) {
    cachedDrugs = loadCSV()
  }
  return cachedDrugs
}

function findDrugByNameFromCsv(name: string): DrugRecord | undefined {
  const target = normalize(name)

  return getAllDrugs().find((drug) => {
    const names = [drug.name, drug.generic_name, ...(drug.brand_names || [])]
      .filter(Boolean)
      .map((value) => normalize(value!))

    return names.includes(target)
  })
}

function joinField(value?: string[]): string {
  return Array.isArray(value) ? value.join(" | ") : ""
}

function extractDoseTextFromLabel(result: OpenFDALabelResult): string {
  return joinField(result.dosage_and_administration)
}

function deriveAllergyTags(result: OpenFDALabelResult, resolvedName: string, genericName?: string): string {
  const tags = new Set<string>()

  if (resolvedName) tags.add(normalize(resolvedName))
  if (genericName) tags.add(normalize(genericName))

  for (const brand of result.openfda?.brand_name || []) {
    tags.add(normalize(brand))
  }

  for (const substance of result.openfda?.substance_name || []) {
    tags.add(normalize(substance))
  }

  for (const pharmClass of result.openfda?.pharm_class_epc || []) {
    tags.add(normalize(pharmClass))
  }

  return [...tags].join(" | ")
}

async function fetchDrugFromOpenFDA(name: string): Promise<DrugRecord | undefined> {
  const escaped = name.replace(/"/g, '\\"')
  const query = [
    `openfda.brand_name:"${escaped}"`,
    `openfda.generic_name:"${escaped}"`,
    `openfda.substance_name:"${escaped}"`,
  ].join(" OR ")

  const url = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(query)}&limit=1`

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
    })

    if (!response.ok) return undefined

    const data = (await response.json()) as { results?: OpenFDALabelResult[] }
    const result = data?.results?.[0]
    if (!result) return undefined

    const genericName = result.openfda?.generic_name?.[0]
    const brandNames = result.openfda?.brand_name || []
    const resolvedName = brandNames[0] || genericName || name
    const drugClass = result.openfda?.pharm_class_epc?.[0]

    return {
      name: resolvedName,
      generic_name: genericName,
      brand_names: brandNames,
      drug_class: drugClass,
      max_daily_dose_text: extractDoseTextFromLabel(result),
      contraindications: joinField(result.contraindications),
      allergy_tags: deriveAllergyTags(result, resolvedName, genericName),
      interactions: joinField(result.drug_interactions),
      warnings: joinField(result.warnings),
      warnings_and_cautions: joinField(result.warnings_and_cautions),
      source: "openfda",
    }
  } catch {
    return undefined
  }
}

export async function findDrugByName(name: string): Promise<DrugRecord | undefined> {
  const fromApi = await fetchDrugFromOpenFDA(name)
  if (fromApi) return fromApi
  return findDrugByNameFromCsv(name)
}

export function getDrugAllergyTags(drug: DrugRecord): string[] {
  const tags = tokenizeList(drug.allergy_tags)

  if (drug.drug_class) tags.push(normalize(drug.drug_class))
  if (drug.generic_name) tags.push(normalize(drug.generic_name))

  for (const brandName of drug.brand_names || []) {
    tags.push(normalize(brandName))
  }

  return [...new Set(tags)]
}

export function getDrugInteractions(drug: DrugRecord): string[] {
  const combined = [drug.interactions, drug.warnings, drug.warnings_and_cautions]
    .filter(Boolean)
    .join(" | ")

  return tokenizeList(combined)
}

export function getDrugContraindications(drug: DrugRecord): string[] {
  const combined = [drug.contraindications, drug.warnings, drug.warnings_and_cautions]
    .filter(Boolean)
    .join(" | ")

  return tokenizeList(combined)
}