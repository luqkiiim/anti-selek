ALTER TABLE "Community" ADD COLUMN "isTutorial" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Community" ADD COLUMN "tutorialOwnerId" TEXT;

CREATE UNIQUE INDEX "Community_tutorialOwnerId_key" ON "Community"("tutorialOwnerId");
CREATE INDEX "Community_isTutorial_idx" ON "Community"("isTutorial");
