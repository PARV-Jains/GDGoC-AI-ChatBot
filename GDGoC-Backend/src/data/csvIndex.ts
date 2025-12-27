import fs from "node:fs/promises";
import path from "node:path";

export interface CsvRecord {
  sourceFile: string;
  rowIndex: number;
  data: Record<string, string>;
  text: string;
}

export interface CsvIndex {
  refreshedAt: string;
  records: CsvRecord[];
}

const DEFAULT_DATA_DIR = "data";
const DEFAULT_INDEX_FILENAME = "csv-index.json";

const getDataDir = () =>
  path.resolve(process.cwd(), process.env.CSV_DATA_DIR || DEFAULT_DATA_DIR);

const getIndexPath = () => {
  const customPath = process.env.CSV_INDEX_PATH;
  if (customPath) {
    return path.resolve(customPath);
  }
  return path.resolve(process.cwd(), DEFAULT_INDEX_FILENAME);
};

const parseCsv = (input: string): string[][] => {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === ",") {
      current.push(field);
      field = "";
      i += 1;
      continue;
    }

    if (char === "\r" && next === "\n") {
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
      i += 2;
      continue;
    }

    if (char === "\n") {
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  return rows;
};

const buildText = (data: Record<string, string>) => {
  return Object.entries(data)
    .map(([key, value]) => `${key}: ${value}`.trim())
    .join(" | ");
};

const normalize = (value: string) => value.trim();

export const refreshCsvIndex = async (): Promise<CsvIndex> => {
  const dataDir = getDataDir();
  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => entry.name);

  const records: CsvRecord[] = [];

  for (const fileName of files) {
    const filePath = path.join(dataDir, fileName);
    const content = await fs.readFile(filePath, "utf8");
    const rows = parseCsv(content);
    if (rows.length === 0) {
      continue;
    }
    const headers = rows[0].map((header) =>
      normalize(header || "column").toLowerCase()
    );

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (row.every((cell) => !cell || cell.trim() === "")) {
        continue;
      }
      const data: Record<string, string> = {};
      for (let colIndex = 0; colIndex < headers.length; colIndex += 1) {
        const key = headers[colIndex] || `column_${colIndex + 1}`;
        const value = row[colIndex] ?? "";
        data[key] = normalize(value);
      }
      records.push({
        sourceFile: fileName,
        rowIndex,
        data,
        text: buildText(data),
      });
    }
  }

  const index: CsvIndex = {
    refreshedAt: new Date().toISOString(),
    records,
  };

  await fs.writeFile(getIndexPath(), JSON.stringify(index, null, 2), "utf8");
  return index;
};

export const loadCsvIndex = async (): Promise<CsvIndex | null> => {
  try {
    const raw = await fs.readFile(getIndexPath(), "utf8");
    return JSON.parse(raw) as CsvIndex;
  } catch {
    return null;
  }
};

const scoreRecord = (record: CsvRecord, tokens: string[]) => {
  const haystack = record.text.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (token && haystack.includes(token)) {
      score += 1;
    }
  }
  return score;
};

export const searchCsvRecords = async (
  query: string,
  limit = 5
): Promise<{ records: CsvRecord[]; refreshedAt?: string }> => {
  let index = await loadCsvIndex();
  if (!index) {
    index = await refreshCsvIndex();
  }

  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const ranked = index.records
    .map((record) => ({ record, score: scoreRecord(record, tokens) }))
    .filter((entry) => entry.score > 0 || tokens.length === 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.record.sourceFile.localeCompare(b.record.sourceFile)
    )
    .slice(0, limit)
    .map((entry) => entry.record);

  return { records: ranked, refreshedAt: index.refreshedAt };
};
