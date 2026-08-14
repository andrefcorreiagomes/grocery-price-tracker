import fs from "node:fs";
import path from "node:path";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "scrape.log");

/** Appends a timestamped line to logs/scrape.log, creating the directory if needed. */
export function appendLog(line: string): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`);
}
