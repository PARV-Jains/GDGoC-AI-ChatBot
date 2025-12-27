import fs from "node:fs/promises";
import path from "node:path";

export interface JsonRecord {
  sourceFile: string;
  pointer: string;
  data: unknown;
  text: string;
}

export interface JsonIndex {
  refreshedAt: string;
  records: JsonRecord[];
}

const DEFAULT_DATA_DIR = "data";
const DEFAULT_INDEX_FILENAME = "json-index.json";

const getDataDir = () =>
  path.resolve(process.cwd(), process.env.JSON_DATA_DIR || DEFAULT_DATA_DIR);

const getIndexPath = () => {
  const customPath = process.env.JSON_INDEX_PATH;
  if (customPath) {
    return path.resolve(customPath);
  }
  return path.resolve(process.cwd(), DEFAULT_INDEX_FILENAME);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toFlatText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => toFlatText(item)).filter(Boolean).join(" | ");
  }
  if (isObject(value)) {
    return Object.entries(value)
      .map(([key, val]) => {
        const flat = toFlatText(val);
        return flat ? `${key}: ${flat}` : "";
      })
      .filter(Boolean)
      .join(" | ");
  }
  return "";
};

const collectRecords = (
  value: unknown,
  sourceFile: string,
  pointer: string,
  records: JsonRecord[]
) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectRecords(item, sourceFile, `${pointer}/${index}`, records);
    });
    return;
  }

  if (isObject(value)) {
    const text = toFlatText(value);
    if (text) {
      records.push({ sourceFile, pointer, data: value, text });
    }
    Object.entries(value).forEach(([key, child]) => {
      collectRecords(child, sourceFile, `${pointer}/${key}`, records);
    });
    return;
  }

  const text = toFlatText(value);
  if (text) {
    records.push({ sourceFile, pointer, data: value, text });
  }
};

export const refreshJsonIndex = async (): Promise<JsonIndex> => {
  const dataDir = getDataDir();
  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name);

  const records: JsonRecord[] = [];

  for (const fileName of files) {
    const filePath = path.join(dataDir, fileName);
    const content = await fs.readFile(filePath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      console.error(`Failed to parse JSON file ${fileName}`, error);
      continue;
    }
    collectRecords(parsed, fileName, "$", records);
  }

  const index: JsonIndex = {
    refreshedAt: new Date().toISOString(),
    records,
  };

  await fs.writeFile(getIndexPath(), JSON.stringify(index, null, 2), "utf8");
  return index;
};

export const loadJsonIndex = async (): Promise<JsonIndex | null> => {
  try {
    const raw = await fs.readFile(getIndexPath(), "utf8");
    return JSON.parse(raw) as JsonIndex;
  } catch {
    return null;
  }
};

const scoreRecord = (record: JsonRecord, tokens: string[]) => {
  const haystack = record.text.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (token && haystack.includes(token)) {
      score += 1;
    }
  }
  return score;
};

export const searchJsonRecords = async (
  query: string,
  limit = 5
): Promise<{ records: JsonRecord[]; refreshedAt?: string }> => {
  let index = await loadJsonIndex();
  if (!index) {
    index = await refreshJsonIndex();
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
