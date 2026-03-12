import fs from 'fs';
import path from 'path';

const root = process.cwd();
const inputPath = path.join(root, 'data', 'drug_reference.csv');
const outputDrugData = path.join(root, 'data', 'drug_data.csv');
const outputInteractions = path.join(root, 'data', 'drug_interaction.csv');

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function csvEscape(value) {
  const text = `${value ?? ''}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const severityHints = [
  { drugs: ['warfarin', 'aspirin'], severity: 'HIGH', description: 'Increased bleeding risk', recommendation: 'Avoid routine co-prescribing or monitor closely for bleeding and INR changes' },
  { drugs: ['warfarin', 'ibuprofen'], severity: 'HIGH', description: 'Additive anticoagulant and GI bleeding risk', recommendation: 'Avoid when possible; monitor INR and bleeding symptoms closely' },
  { drugs: ['aspirin', 'ibuprofen'], severity: 'MODERATE', description: 'Reduced antiplatelet effect of aspirin and increased GI toxicity', recommendation: 'Separate dosing if required and review GI risk' },
  { drugs: ['amoxicillin', 'warfarin'], severity: 'MODERATE', description: 'Possible INR increase and bleeding risk', recommendation: 'Monitor INR after antibiotic initiation or dose change' },
  { drugs: ['azithromycin', 'warfarin'], severity: 'MODERATE', description: 'Possible INR increase and bleeding risk', recommendation: 'Monitor INR during and shortly after therapy' },
  { drugs: ['clarithromycin', 'atorvastatin'], severity: 'HIGH', description: 'Raised statin exposure and myopathy risk', recommendation: 'Avoid combination or hold statin while macrolide is used' },
  { drugs: ['clarithromycin', 'simvastatin'], severity: 'HIGH', description: 'Raised statin exposure and rhabdomyolysis risk', recommendation: 'Contraindicated or use an alternative antibiotic/statin' },
  { drugs: ['simvastatin', 'amlodipine'], severity: 'MODERATE', description: 'Amlodipine can increase simvastatin levels', recommendation: 'Use lower simvastatin dose and monitor for myopathy' },
  { drugs: ['sertraline', 'tramadol'], severity: 'HIGH', description: 'Serotonergic toxicity and seizure risk', recommendation: 'Avoid if possible; monitor for serotonin syndrome' },
  { drugs: ['fluoxetine', 'tramadol'], severity: 'HIGH', description: 'Serotonergic toxicity and seizure risk', recommendation: 'Avoid if possible; monitor for serotonin syndrome' },
  { drugs: ['fluoxetine', 'metoprolol'], severity: 'MODERATE', description: 'CYP inhibition can increase beta-blocker exposure', recommendation: 'Monitor heart rate, blood pressure, and beta-blocker adverse effects' },
  { drugs: ['gabapentin', 'oxycodone'], severity: 'HIGH', description: 'Additive CNS and respiratory depression risk', recommendation: 'Use the lowest effective doses and monitor sedation/respiration' },
  { drugs: ['omeprazole', 'clopidogrel'], severity: 'MODERATE', description: 'Reduced antiplatelet activation of clopidogrel', recommendation: 'Consider an alternative acid suppressant if clinically appropriate' },
  { drugs: ['lisinopril', 'ibuprofen'], severity: 'MODERATE', description: 'Reduced antihypertensive effect and renal impairment risk', recommendation: 'Monitor blood pressure and renal function' },
  { drugs: ['hydrochlorothiazide', 'lithium'], severity: 'HIGH', description: 'Lithium levels may rise significantly', recommendation: 'Avoid or monitor lithium concentration closely' },
];

function findHint(a, b) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return severityHints.find((hint) => hint.drugs.includes(x) && hint.drugs.includes(y));
}

const rows = parseCsv(fs.readFileSync(inputPath, 'utf8'));

const compatHeaders = ['name','standard_dosage','max_daily_dose','contraindications','interactions','allergy_tags','drug_class'];
const compatRows = rows.map((row) => [
  row.name,
  row.max_daily_dose_text || '',
  row.max_daily_dose_text || '',
  (row.contraindications || '').replace(/\|/g, ', '),
  (row.interactions || '').replace(/\|/g, ', '),
  (row.allergy_tags || '').replace(/\|/g, ', '),
  row.drug_class,
]);

fs.writeFileSync(outputDrugData, [compatHeaders.join(','), ...compatRows.map((r) => r.map(csvEscape).join(','))].join('\n'));

const interactionMap = new Map();
for (const row of rows) {
  const drugA = row.name.trim();
  const linked = (row.interactions || '').split('|').map((item) => item.trim()).filter(Boolean);
  for (const drugB of linked) {
    const [left, right] = [drugA, drugB].sort((a, b) => a.localeCompare(b));
    const key = `${left}::${right}`.toLowerCase();
    if (interactionMap.has(key)) continue;
    const hint = findHint(left, right);
    interactionMap.set(key, {
      drug_a: left,
      drug_b: right,
      severity: hint?.severity || 'MODERATE',
      description: hint?.description || `Potential interaction between ${left} and ${right}`,
      recommendation: hint?.recommendation || 'Review combination, monitor patient response, and check current label guidance.',
    });
  }
}

const interactionHeaders = ['drug_a','drug_b','severity','description','recommendation'];
const interactionRows = [...interactionMap.values()].sort((a, b) => a.drug_a.localeCompare(b.drug_a) || a.drug_b.localeCompare(b.drug_b));
fs.writeFileSync(outputInteractions, [interactionHeaders.join(','), ...interactionRows.map((row) => interactionHeaders.map((h) => csvEscape(row[h])).join(','))].join('\n'));

console.log(`Wrote ${rows.length} drug rows to ${path.relative(root, outputDrugData)}`);
console.log(`Wrote ${interactionRows.length} interaction rows to ${path.relative(root, outputInteractions)}`);
