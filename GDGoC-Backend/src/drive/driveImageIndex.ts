import fs from "node:fs/promises";
import path from "node:path";

export interface DriveImageItem {
  id: string;
  name: string;
  mimeType: string;
  description?: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  directUrl: string;
}

export interface DriveImageIndex {
  refreshedAt: string;
  folderId: string;
  items: DriveImageItem[];
}

const DEFAULT_FOLDER_ID = "14yabXrxu1g5owt2fbIwIWP06svWo_GaO";
const DEFAULT_INDEX_FILENAME = "drive-images.json";

const getIndexPath = () => {
  const customPath = process.env.DRIVE_IMAGE_INDEX_PATH;
  if (customPath) {
    return path.resolve(customPath);
  }
  return path.resolve(process.cwd(), DEFAULT_INDEX_FILENAME);
};

const getFolderId = () =>
  process.env.DRIVE_IMAGE_FOLDER_ID || DEFAULT_FOLDER_ID;

const buildDriveApiUrl = (folderId: string, pageToken?: string) => {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_DRIVE_API_KEY is required for Drive indexing.");
  }

  const q = encodeURIComponent(
    `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`
  );
  const fields = encodeURIComponent(
    "nextPageToken,files(id,name,mimeType,description,webViewLink,webContentLink,thumbnailLink,createdTime,modifiedTime)"
  );
  const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
  return `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=1000${page}&key=${apiKey}`;
};

const toDirectUrl = (fileId: string) =>
  `https://drive.google.com/uc?export=download&id=${fileId}`;

export const refreshDriveImageIndex = async (): Promise<DriveImageIndex> => {
  const folderId = getFolderId();
  const items: DriveImageItem[] = [];
  let nextPageToken: string | undefined;

  do {
    const url = buildDriveApiUrl(folderId, nextPageToken);
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Drive API request failed (${response.status}): ${errorText}`
      );
    }
    const data = (await response.json()) as {
      nextPageToken?: string;
      files?: Array<{
        id: string;
        name: string;
        mimeType: string;
        description?: string;
        webViewLink?: string;
        webContentLink?: string;
        thumbnailLink?: string;
        createdTime?: string;
        modifiedTime?: string;
      }>;
    };

    for (const file of data.files ?? []) {
      if (!file.id || !file.mimeType?.startsWith("image/")) {
        continue;
      }
      items.push({
        id: file.id,
        name: file.name ?? "untitled",
        mimeType: file.mimeType,
        description: file.description,
        webViewLink: file.webViewLink,
        webContentLink: file.webContentLink,
        thumbnailLink: file.thumbnailLink,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        directUrl: toDirectUrl(file.id),
      });
    }

    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  const index: DriveImageIndex = {
    refreshedAt: new Date().toISOString(),
    folderId,
    items,
  };

  await fs.writeFile(getIndexPath(), JSON.stringify(index, null, 2), "utf8");
  return index;
};

export const loadDriveImageIndex = async (): Promise<DriveImageIndex | null> => {
  try {
    const raw = await fs.readFile(getIndexPath(), "utf8");
    return JSON.parse(raw) as DriveImageIndex;
  } catch {
    return null;
  }
};

const scoreItem = (item: DriveImageItem, tokens: string[]) => {
  const haystack = `${item.name} ${item.description ?? ""}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (token && haystack.includes(token)) {
      score += 1;
    }
  }
  return score;
};

export const searchDriveImages = async (
  query: string,
  limit = 5
): Promise<{ items: DriveImageItem[]; refreshedAt?: string }> => {
  const index = await loadDriveImageIndex();
  if (!index || index.items.length === 0) {
    return { items: [] };
  }

  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const ranked = index.items
    .map((item) => ({ item, score: scoreItem(item, tokens) }))
    .filter((entry) => entry.score > 0 || tokens.length === 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((entry) => entry.item);

  return { items: ranked, refreshedAt: index.refreshedAt };
};
