CREATE TABLE "GoogleIdentity" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    CONSTRAINT "GoogleIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GoogleIdentity_subject_key" ON "GoogleIdentity"("subject");
