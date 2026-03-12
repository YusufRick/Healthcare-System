import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

export interface DrugRecord {
  name: string;
  generic_name?: string;
  drug_class?: string;
  max_daily_dose?: string;
  max_daily_dose_mg?: string;
  max_daily_dose_text?: string;
  contraindications: string;
  allergy_tags?: string;
  interactions?: string;
}

let cachedDrugs: DrugRecord[] | null = null;

function readCsv(fileName: string): DrugRecord[] {
  const filePath = path.join(process.cwd(), "data", fileName);
  const fileContent = fs.readFileSync(filePath, "utf-8");

  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  });

  return records as DrugRecord[];
}

function loadCSV(): DrugRecord[] {
  const preferred = path.join(process.cwd(), "data", "drug_reference.csv");
  if (fs.existsSync(preferred)) {
    return readCsv("drug_reference.csv");
  }
  return readCsv("drug_data.csv");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function tokenizeList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[|,;]/)
    .map((item) => normalize(item))
    .filter(Boolean);
}

export function getAllDrugs(): DrugRecord[] {
  if (!cachedDrugs) {
    cachedDrugs = loadCSV();
  }
  return cachedDrugs;
}

export function findDrugByName(name: string): DrugRecord | undefined {
  const target = normalize(name);
  return getAllDrugs().find((drug) => {
    const names = [drug.name, drug.generic_name].filter(Boolean).map((value) => normalize(value!));
    return names.includes(target);
  });
}

export function getDrugAllergyTags(drug: DrugRecord): string[] {
  const tags = tokenizeList(drug.allergy_tags);
  if (drug.drug_class) {
    tags.push(normalize(drug.drug_class));
  }
  return [...new Set(tags)];
}

export function getDrugInteractions(drug: DrugRecord): string[] {
  return tokenizeList(drug.interactions);
}

export function getDrugContraindications(drug: DrugRecord): string[] {
  return tokenizeList(drug.contraindications);
}
