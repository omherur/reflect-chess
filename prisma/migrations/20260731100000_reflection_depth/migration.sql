-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Reflection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyMomentId" TEXT NOT NULL,
    "thoughts" TEXT NOT NULL,
    "replaySame" BOOLEAN NOT NULL DEFAULT false,
    "replayMoveSan" TEXT NOT NULL,
    "replayMoveUci" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 3,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "followUpQuestion" TEXT,
    "followUpAnswer" TEXT,
    "replayEvalCp" INTEGER,
    "replayEvalMate" INTEGER,
    "replayVerdict" TEXT,
    "explanation" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reflection_keyMomentId_fkey" FOREIGN KEY ("keyMomentId") REFERENCES "KeyMoment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Reflection" ("createdAt", "explanation", "id", "keyMomentId", "replayEvalCp", "replayEvalMate", "replayMoveSan", "replayMoveUci", "replaySame", "replayVerdict", "thoughts") SELECT "createdAt", "explanation", "id", "keyMomentId", "replayEvalCp", "replayEvalMate", "replayMoveSan", "replayMoveUci", "replaySame", "replayVerdict", "thoughts" FROM "Reflection";
DROP TABLE "Reflection";
ALTER TABLE "new_Reflection" RENAME TO "Reflection";
CREATE UNIQUE INDEX "Reflection_keyMomentId_key" ON "Reflection"("keyMomentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

