import fs from "node:fs/promises";
import path from "node:path";

const dir = path.resolve("docs/decisions");
const entries = await fs.readdir(dir);
const pattern = /^(\d{4})-.+\.md$/;
const byNumber = new Map();

for (const entry of entries) {
  const match = entry.match(pattern);
  if (!match) continue;
  const [, number] = match;
  const files = byNumber.get(number) ?? [];
  files.push(entry);
  byNumber.set(number, files);
}

const duplicates = [...byNumber.entries()].filter(([, files]) => files.length > 1);
if (duplicates.length) {
  console.error("Duplicate ADR numbers found in docs/decisions/:");
  for (const [number, files] of duplicates) {
    console.error(`  ${number}: ${files.join(", ")}`);
  }
  console.error(
    "Renumber one to the next unused integer after the highest existing ADR (ls docs/decisions/).",
  );
  process.exit(1);
}

console.log(`docs/decisions/: ${byNumber.size} ADRs, no duplicate numbers.`);
