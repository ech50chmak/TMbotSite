/*
  Warnings:

  - You are about to drop the column `angle` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `dxfName` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `seam` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `startX` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `startY` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `tileH` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `tileW` on the `Project` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "svg" TEXT,
    "params" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("createdAt", "id", "name", "svg", "updatedAt", "userId") SELECT "createdAt", "id", "name", "svg", "updatedAt", "userId" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
