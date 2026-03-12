import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { RiskAlert } from "../types";
import { DrugRecord, getDrugInteractions } from "./drugRepository";

export interface DrugInteraction {
  drug_a: string;
  drug_b: string;
  severity: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
  description: string;
  recommendation: string;
}

let cachedInteractions: DrugInteraction[] | null = null;

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function loadInteractionsCSV(): DrugInteraction[] {
  try {
    const filePath = path.join(process.cwd(), "data", "drug_interaction.csv");
    const fileContent = fs.readFileSync(filePath, "utf-8");

    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    });

    return records as DrugInteraction[];
  } catch {
    console.error("[InteractionChecker] Failed to load drug_interaction.csv");
    return [];
  }
}

function getAllInteractions(): DrugInteraction[] {
  if (!cachedInteractions) {
    cachedInteractions = loadInteractionsCSV();
  }
  return cachedInteractions;
}

function namesMatch(candidate: string, query: string) {
  const left = normalize(candidate);
  const right = normalize(query);
  return left === right || left.includes(right) || right.includes(left);
}

function findInteraction(drugA: string, drugB: string): DrugInteraction | undefined {
  const interactions = getAllInteractions();

  return interactions.find((interaction) => {
    return (
      (namesMatch(interaction.drug_a, drugA) && namesMatch(interaction.drug_b, drugB)) ||
      (namesMatch(interaction.drug_a, drugB) && namesMatch(interaction.drug_b, drugA))
    );
  });
}

export function checkInteractions(prescribedDrugs: DrugRecord[]): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  for (let i = 0; i < prescribedDrugs.length; i++) {
    for (let j = i + 1; j < prescribedDrugs.length; j++) {
      const drugA = prescribedDrugs[i];
      const drugB = prescribedDrugs[j];

      const interaction = findInteraction(drugA.name, drugB.name);

      if (interaction) {
        alerts.push({
          type: "interaction",
          severity: mapSeverity(interaction.severity),
          message: `${interaction.description}. Recommendation: ${interaction.recommendation}`,
        });
        continue;
      }

      const drugAInteractions = getDrugInteractions(drugA);
      const drugBInteractions = getDrugInteractions(drugB);
      const fallbackMatch =
        drugAInteractions.some((entry) => namesMatch(entry, drugB.name)) ||
        drugBInteractions.some((entry) => namesMatch(entry, drugA.name));

      if (fallbackMatch) {
        alerts.push({
          type: "interaction",
          severity: "WARNING",
          message: `Potential interaction between ${drugA.name} and ${drugB.name}. Review current label guidance before confirming.`,
        });
      }
    }
  }

  return dedupeAlerts(alerts);
}

function mapSeverity(severity: DrugInteraction["severity"]): "CRITICAL" | "WARNING" | "INFO" {
  if (severity === "CRITICAL" || severity === "HIGH") return "CRITICAL";
  if (severity === "MODERATE") return "WARNING";
  return "INFO";
}

function dedupeAlerts(alerts: RiskAlert[]) {
  return alerts.filter((alert, index) => alerts.findIndex((other) => other.message === alert.message) === index);
}
