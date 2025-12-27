import fs from "node:fs/promises";
import path from "node:path";

export interface QaRecord {
  sourceFile: string;
  question: string;
  answer: string;
  text: string;
}

export interface QaIndex {
  refreshedAt: string;
  records: QaRecord[];
}

const DEFAULT_DATA_DIR = "data";
const DEFAULT_INDEX_FILENAME = "qa-index.json";
const DEFAULT_QA_FILENAME = "training_qa_pairs.jsonl";

const getDataDir = () =>
  path.resolve(process.cwd(), process.env.QA_DATA_DIR || DEFAULT_DATA_DIR);

const getIndexPath = () => {
  const customPath = process.env.QA_INDEX_PATH;
  if (customPath) {
    return path.resolve(customPath);
  }
  return path.resolve(process.cwd(), DEFAULT_INDEX_FILENAME);
};

const getQaFilePath = () =>
  path.resolve(getDataDir(), process.env.QA_FILE || DEFAULT_QA_FILENAME);

const scoreRecord = (record: QaRecord, tokens: string[]) => {
  const haystack = record.text.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (token && haystack.includes(token)) {
      score += 1;
    }
  }
  return score;
};

export const refreshQaIndex = async (): Promise<QaIndex> => {
  const filePath = getQaFilePath();
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter(Boolean);
  const records: QaRecord[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { question?: string; answer?: string };
      if (!parsed.question || !parsed.answer) {
        continue;
      }
      const text = `question: ${parsed.question} | answer: ${parsed.answer}`;
      records.push({
        sourceFile: path.basename(filePath),
        question: parsed.question,
        answer: parsed.answer,
        text,
      });
    } catch (error) {
      console.error("Failed to parse JSONL line in QA file", error);
    }
  }

  const index: QaIndex = {
    refreshedAt: new Date().toISOString(),
    records,
  };

  await fs.writeFile(getIndexPath(), JSON.stringify(index, null, 2), "utf8");
  return index;
};

export const loadQaIndex = async (): Promise<QaIndex | null> => {
  try {
    const raw = await fs.readFile(getIndexPath(), "utf8");
    return JSON.parse(raw) as QaIndex;
  } catch {
    return null;
  }
};

export const searchQaRecords = async (
  query: string,
  limit = 5
): Promise<{ records: QaRecord[]; refreshedAt?: string }> => {
  let index = await loadQaIndex();
  if (!index) {
    index = await refreshQaIndex();
  }

  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const ranked = index.records
    .map((record) => ({ record, score: scoreRecord(record, tokens) }))
    .filter((entry) => entry.score > 0 || tokens.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.record);

  return { records: ranked, refreshedAt: index.refreshedAt };
};
