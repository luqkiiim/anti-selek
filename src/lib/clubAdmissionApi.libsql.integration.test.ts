import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient, type Client } from "@libsql/client";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";

let db: PrismaClient;
let libsql: Client;
const dir = mkdtempSync(path.join(tmpdir(), "club-discovery-libsql-"));
const file = path.join(dir, "fixture.db");
const previousSecret = process.env.AUTH_SECRET;
vi.mock("@/lib/prisma", () => ({ get prisma() { return db; } }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "requester" } }) }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null }));
import { admissionDiscoveryApi } from "./clubAdmissionApi";
import { clubEntryCookieName, signClubEntryProof, verifyClubEntryPassword } from "./clubJoinEntry";

const completedAt = new Date("2026-09-12T08:30:00.000Z");
beforeAll(async () => {
  process.env.AUTH_SECRET = "libsql-discovery-test-secret-at-least-32-bytes";
  writeFileSync(file, "");
  const url = "file:" + file.replaceAll("\\", "/");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  libsql = createClient({ url });
  const adapter = new PrismaLibSQL(libsql as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]);
  db = new PrismaClient({ adapter, transactionOptions: { timeout: 1000 } });
  await db.user.createMany({ data: [
    { id: "creator", name: "Creator", email: "creator@fixture.example", passwordHash: "unused" },
    { id: "requester", name: "Requester", email: "requester@fixture.example", passwordHash: "unused" },
  ] });
  await db.club.create({ data: { id: "club", name: "Adapter Club", createdById: "creator", allowJoinRequests: true, isPasswordProtected: true, passwordHash: await bcrypt.hash("code", 4) } });
  await db.player.createMany({ data: ["candidate", "p2", "p3", "p4"].map(id => ({ id, name: id })) });
  await db.clubMember.create({ data: { clubId: "club", playerId: "candidate", elo: 1450 } });
  const session = await db.session.create({ data: { code: "ADAPTER", name: "Recorded match", clubId: "club", status: "COMPLETED" } });
  const court = await db.court.create({ data: { sessionId: session.id, courtNumber: 1 } });
  await db.match.create({ data: { sessionId: session.id, courtId: court.id, team1Player1Id: "candidate", team1Player2Id: "p2", team2Player1Id: "p3", team2Player2Id: "p4", status: "COMPLETED", completedAt, team1Score: 21, team2Score: 18, winnerTeam: 1 } });
}, 30000);
afterAll(async () => {
  await db?.$disconnect(); libsql?.close();
  if (previousSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = previousSecret;
  if (!path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unsafe fixture cleanup path");
  rmSync(dir, { recursive: true, force: true });
});
it("returns unlocked candidate match summaries without querying the parent libSQL mutex from inside the read transaction", async () => {
  const club = await db.club.findUniqueOrThrow({ where: { id: "club" } });
  const account = await db.user.findUniqueOrThrow({ where: { id: "requester" } });
  const proof = await verifyClubEntryPassword(club, account, "code");
  const token = await signClubEntryProof(proof!);
  const request = new Request("http://localhost/api/clubs/join-requests?clubId=club", { headers: { Cookie: `${clubEntryCookieName("club")}=${token}` } });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      admissionDiscoveryApi(request),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("libSQL discovery exceeded two seconds")), 2000); }),
    ]);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ requiresJoinCode: false, players: [{ id: "candidate", elo: 1450, matchesPlayed: 1, lastPlayedAt: completedAt.toISOString() }] });
    expect(await db.clubAdmissionRequest.count()).toBe(0);
    expect(await db.clubAccess.count()).toBe(0);
  } finally { if (timer) clearTimeout(timer); }
}, 10000);
