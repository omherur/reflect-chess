import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const TEST_DB_PATH = path.join(__dirname, "..", "..", "prisma", "test.db");
export const TEST_DATABASE_URL = `file:${TEST_DB_PATH}`;

export default async function setup() {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });

  return () => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  };
}
