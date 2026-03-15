import fs from "node:fs";
import path from "node:path";

const stateFilePath = process.env.PENDING_STATE_FILE
  ? path.resolve(process.env.PENDING_STATE_FILE)
  : path.resolve(process.cwd(), ".pending-by-chat.json");

function loadInitialEntries() {
  try {
    if (!fs.existsSync(stateFilePath)) {
      return [];
    }
    const raw = fs.readFileSync(stateFilePath, "utf8");
    if (!raw.trim()) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry) => Array.isArray(entry) && entry.length === 2)
      .map(([key, value]) => [String(key), value]);
  } catch (error) {
    console.warn("Could not load pending chat state:", error);
    return [];
  }
}

function persistEntries(entries) {
  try {
    const dir = path.dirname(stateFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${stateFilePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(entries), "utf8");
    fs.renameSync(tempPath, stateFilePath);
  } catch (error) {
    console.warn("Could not persist pending chat state:", error);
  }
}

class PersistentPendingMap extends Map {
  constructor(initialEntries = []) {
    super(initialEntries);
  }

  set(key, value) {
    const result = super.set(String(key), value);
    persistEntries([...this.entries()]);
    return result;
  }

  delete(key) {
    const result = super.delete(String(key));
    persistEntries([...this.entries()]);
    return result;
  }

  clear() {
    super.clear();
    persistEntries([]);
  }
}

export const pendingByChat = new PersistentPendingMap(loadInitialEntries());
