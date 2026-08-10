/*
  Warnings:

  - You are about to drop the column `explanation` on the `KeyMoment` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KeyMoment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "moveId" TEXT NOT NULL,
    "sortIndex" INTEGER NOT NULL,
    "ply" INTEGER NOT NULL,
    "fen" TEXT NOT NULL,
    "originalSan" TEXT NOT NULL,
    "originalUci" TEXT NOT NULL,
    "bestMoveSan" TEXT NOT NULL,
    "bestMoveUci" TEXT NOT NULL,
    "evalBeforeCp" INTEGER,
    "evalBeforeMate" INTEGER,
    "evalAfterCp" INTEGER,
    "evalAfterMate" INTEGER,
    "selectionReason" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "principalVariation" TEXT NOT NULL,
    "conceptHighlights" TEXT NOT NULL DEFAULT '[]',
    "importanceScore" INTEGER NOT NULL DEFAULT 0,
    "importanceTier" TEXT NOT NULL DEFAULT 'MINOR',
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KeyMoment_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KeyMoment_moveId_fkey" FOREIGN KEY ("moveId") REFERENCES "GameMove" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_KeyMoment" ("bestMoveSan", "bestMoveUci", "classification", "createdAt", "evalAfterCp", "evalAfterMate", "evalBeforeCp", "evalBeforeMate", "fen", "gameId", "id", "moveId", "originalSan", "originalUci", "ply", "principalVariation", "reviewStatus", "selectionReason", "sortIndex") SELECT "bestMoveSan", "bestMoveUci", "classification", "createdAt", "evalAfterCp", "evalAfterMate", "evalBeforeCp", "evalBeforeMate", "fen", "gameId", "id", "moveId", "originalSan", "originalUci", "ply", "principalVariation", "reviewStatus", "selectionReason", "sortIndex" FROM "KeyMoment";
DROP TABLE "KeyMoment";
ALTER TABLE "new_KeyMoment" RENAME TO "KeyMoment";
CREATE UNIQUE INDEX "KeyMoment_gameId_sortIndex_key" ON "KeyMoment"("gameId", "sortIndex");
CREATE TABLE "new_Reflection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyMomentId" TEXT NOT NULL,
    "thoughts" TEXT NOT NULL,
    "replaySame" BOOLEAN NOT NULL DEFAULT false,
    "replayMoveSan" TEXT NOT NULL,
    "replayMoveUci" TEXT NOT NULL,
    "replayEvalCp" INTEGER,
    "replayEvalMate" INTEGER,
    "replayVerdict" TEXT,
    "explanation" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reflection_keyMomentId_fkey" FOREIGN KEY ("keyMomentId") REFERENCES "KeyMoment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Reflection" ("createdAt", "id", "keyMomentId", "replayEvalCp", "replayEvalMate", "replayMoveSan", "replayMoveUci", "replaySame", "replayVerdict", "thoughts") SELECT "createdAt", "id", "keyMomentId", "replayEvalCp", "replayEvalMate", "replayMoveSan", "replayMoveUci", "replaySame", "replayVerdict", "thoughts" FROM "Reflection";
DROP TABLE "Reflection";
ALTER TABLE "new_Reflection" RENAME TO "Reflection";
CREATE UNIQUE INDEX "Reflection_keyMomentId_key" ON "Reflection"("keyMomentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
