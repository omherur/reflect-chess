-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ChessAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ChessAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "pgn" TEXT NOT NULL,
    "whitePlayer" TEXT NOT NULL,
    "blackPlayer" TEXT NOT NULL,
    "userColor" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "playedAt" DATETIME,
    "timeControl" TEXT,
    "opening" TEXT,
    "analysisStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "analysisProgress" INTEGER NOT NULL DEFAULT 0,
    "analysisError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Game_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameMove" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "ply" INTEGER NOT NULL,
    "moveNumber" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "san" TEXT NOT NULL,
    "uci" TEXT NOT NULL,
    "fenBefore" TEXT NOT NULL,
    "fenAfter" TEXT NOT NULL,
    CONSTRAINT "GameMove_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KeyMoment" (
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
    "explanation" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KeyMoment_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KeyMoment_moveId_fkey" FOREIGN KEY ("moveId") REFERENCES "GameMove" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reflection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyMomentId" TEXT NOT NULL,
    "thoughts" TEXT NOT NULL,
    "replaySame" BOOLEAN NOT NULL DEFAULT false,
    "replayMoveSan" TEXT NOT NULL,
    "replayMoveUci" TEXT NOT NULL,
    "replayEvalCp" INTEGER,
    "replayEvalMate" INTEGER,
    "replayVerdict" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reflection_keyMomentId_fkey" FOREIGN KEY ("keyMomentId") REFERENCES "KeyMoment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalysisCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fen" TEXT NOT NULL,
    "settings" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ChessAccount_platform_username_userId_key" ON "ChessAccount"("platform", "username", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_userId_platform_externalId_key" ON "Game"("userId", "platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "GameMove_gameId_ply_key" ON "GameMove"("gameId", "ply");

-- CreateIndex
CREATE UNIQUE INDEX "KeyMoment_gameId_sortIndex_key" ON "KeyMoment"("gameId", "sortIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Reflection_keyMomentId_key" ON "Reflection"("keyMomentId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisCache_fen_settings_key" ON "AnalysisCache"("fen", "settings");
