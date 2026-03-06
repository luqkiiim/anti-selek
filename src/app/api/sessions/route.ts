import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId, withCommunityElo } from "@/lib/communityElo";
import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionStatus,
  SessionType,
} from "@/types/enums";

export const dynamic = "force-dynamic";

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const {
      name,
      type = SessionType.POINTS,
      mode = SessionMode.MEXICANO,
      playerIds = [],
      guestNames = [],
      playerConfigs = [],
      guestConfigs = [],
      communityId,
      courtCount = 3,
    } = body as {
      name?: unknown;
      type?: SessionType;
      mode?: SessionMode;
      playerIds?: unknown;
      guestNames?: unknown;
      playerConfigs?: unknown;
      guestConfigs?: unknown;
      communityId?: unknown;
      courtCount?: unknown;
    };

    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Session name required" }, { status: 400 });
    }
    if (typeof communityId !== "string" || !communityId) {
      return NextResponse.json({ error: "Community is required" }, { status: 400 });
    }
    if (!Number.isInteger(courtCount) || (courtCount as number) < 1 || (courtCount as number) > 10) {
      return NextResponse.json({ error: "Court count must be an integer between 1 and 10" }, { status: 400 });
    }
    if (![SessionMode.MEXICANO, SessionMode.MIXICANO].includes(mode)) {
      return NextResponse.json({ error: "Invalid session mode" }, { status: 400 });
    }

    const requesterMembership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: session.user.id,
        },
      },
    });

    if (!requesterMembership && !session.user.isAdmin) {
      return NextResponse.json({ error: "Not a community member" }, { status: 403 });
    }
    if (!session.user.isAdmin && requesterMembership?.role !== "ADMIN") {
      return NextResponse.json({ error: "Only community admins can create tournaments" }, { status: 403 });
    }

    // Create session with unique code
    let code = generateCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.session.findUnique({ where: { code } });
      if (!existing) break;
      code = generateCode();
      attempts++;
    }

    // Ensure unique player IDs and include creator
    const requestedPlayerIds = Array.isArray(playerIds)
      ? playerIds.filter((id): id is string => typeof id === "string")
      : [];

    const playerConfigMap = new Map<
      string,
      { gender?: PlayerGender; partnerPreference?: PartnerPreference }
    >();
    if (Array.isArray(playerConfigs)) {
      for (const config of playerConfigs) {
        if (typeof config !== "object" || config === null) continue;
        const candidate = config as {
          userId?: unknown;
          gender?: unknown;
          partnerPreference?: unknown;
        };
        if (typeof candidate.userId !== "string") continue;
        const normalized: { gender?: PlayerGender; partnerPreference?: PartnerPreference } = {};
        if (
          typeof candidate.gender === "string" &&
          [PlayerGender.MALE, PlayerGender.FEMALE, PlayerGender.UNSPECIFIED].includes(
            candidate.gender as PlayerGender
          )
        ) {
          normalized.gender = candidate.gender as PlayerGender;
        }
        if (
          typeof candidate.partnerPreference === "string" &&
          [PartnerPreference.OPEN, PartnerPreference.FEMALE_FLEX].includes(
            candidate.partnerPreference as PartnerPreference
          )
        ) {
          normalized.partnerPreference = candidate.partnerPreference as PartnerPreference;
        }
        playerConfigMap.set(candidate.userId, normalized);
      }
    }

    const normalizedGuestsByName = new Map<
      string,
      {
        name: string;
        gender: PlayerGender;
        partnerPreference: PartnerPreference;
        initialElo: number;
      }
    >();

    const upsertGuest = (
      guestName: string,
      gender: PlayerGender =
        mode === SessionMode.MIXICANO ? PlayerGender.MALE : PlayerGender.UNSPECIFIED,
      partnerPreference: PartnerPreference = PartnerPreference.OPEN,
      initialElo = 1000,
      overwrite = false
    ) => {
      const trimmed = guestName.trim();
      if (trimmed.length < 2) return;
      const key = trimmed.toLowerCase();
      if (normalizedGuestsByName.has(key) && !overwrite) return;
      normalizedGuestsByName.set(key, {
        name: trimmed,
        gender,
        partnerPreference,
        initialElo,
      });
    };

    if (Array.isArray(guestNames)) {
      for (const guestName of guestNames) {
        if (typeof guestName === "string") {
          upsertGuest(guestName);
        }
      }
    }

    if (Array.isArray(guestConfigs)) {
      for (const guest of guestConfigs) {
        if (typeof guest !== "object" || guest === null) continue;
        const candidate = guest as {
          name?: unknown;
          gender?: unknown;
          partnerPreference?: unknown;
          initialElo?: unknown;
        };
        if (typeof candidate.name !== "string") continue;

        const gender =
          typeof candidate.gender === "string" &&
          [PlayerGender.MALE, PlayerGender.FEMALE, PlayerGender.UNSPECIFIED].includes(
            candidate.gender as PlayerGender
          )
            ? (candidate.gender as PlayerGender)
            : mode === SessionMode.MIXICANO
              ? PlayerGender.MALE
              : PlayerGender.UNSPECIFIED;
        const partnerPreference =
          typeof candidate.partnerPreference === "string" &&
          [PartnerPreference.OPEN, PartnerPreference.FEMALE_FLEX].includes(
            candidate.partnerPreference as PartnerPreference
          )
            ? (candidate.partnerPreference as PartnerPreference)
            : PartnerPreference.OPEN;
        const initialElo =
          typeof candidate.initialElo === "number" &&
          Number.isInteger(candidate.initialElo) &&
          candidate.initialElo >= 0 &&
          candidate.initialElo <= 5000
            ? candidate.initialElo
            : 1000;

        // Explicit guest configs must override defaults from guestNames.
        upsertGuest(candidate.name, gender, partnerPreference, initialElo, true);
      }
    }

    const normalizedGuests = Array.from(normalizedGuestsByName.values());

    const memberRows = await prisma.communityMember.findMany({
      where: { communityId },
      select: { userId: true },
    });
    const memberSet = new Set(memberRows.map((m) => m.userId));

    const uniquePlayerIds = Array.from(
      new Set([...requestedPlayerIds, session.user.id])
    ).filter((id) => memberSet.has(id));

    if (uniquePlayerIds.length + normalizedGuests.length < 2) {
      return NextResponse.json(
        { error: "At least 2 total players (members and/or guests) are required to create a tournament" },
        { status: 400 }
      );
    }

    console.log("Creating session with players:", uniquePlayerIds);

    const selectedUsers = await prisma.user.findMany({
      where: { id: { in: uniquePlayerIds } },
      select: {
        id: true,
        name: true,
        gender: true,
        partnerPreference: true,
      },
    });
    const selectedUserById = new Map(selectedUsers.map((u) => [u.id, u]));

    const memberSessionConfigs = uniquePlayerIds.map((userId) => {
      const selectedUser = selectedUserById.get(userId);
      const override = playerConfigMap.get(userId);
      const rawGender = override?.gender ?? (selectedUser?.gender as PlayerGender | undefined);
      const sessionGender =
        mode === SessionMode.MIXICANO
          ? [PlayerGender.MALE, PlayerGender.FEMALE].includes(rawGender as PlayerGender)
            ? (rawGender as PlayerGender)
            : PlayerGender.MALE
          : [PlayerGender.MALE, PlayerGender.FEMALE, PlayerGender.UNSPECIFIED].includes(
                rawGender as PlayerGender
              )
            ? (rawGender as PlayerGender)
            : PlayerGender.UNSPECIFIED;
      const sessionPartnerPreference =
        override?.partnerPreference ??
        (selectedUser?.partnerPreference as PartnerPreference | undefined) ??
        PartnerPreference.OPEN;

      return {
        userId,
        isGuest: false,
        gender: sessionGender,
        partnerPreference: sessionPartnerPreference,
        sessionPoints: 0,
      };
    });

    if (mode === SessionMode.MIXICANO) {
      const invalidGuest = normalizedGuests.find(
        (guest) => ![PlayerGender.MALE, PlayerGender.FEMALE].includes(guest.gender)
      );
      if (invalidGuest) {
        return NextResponse.json(
          { error: `MIXICANO requires guest gender for ${invalidGuest.name}` },
          { status: 400 }
        );
      }
    }

    const normalizedCourtCount = courtCount as number;
    const newSession = await prisma.$transaction(async (tx) => {
      const createdSession = await tx.session.create({
        data: {
          code,
          communityId,
          name: name.trim(),
          type,
          mode,
          status: SessionStatus.WAITING,
          courts: {
            create: Array.from({ length: normalizedCourtCount }, (_, i) => ({
              courtNumber: i + 1,
            })),
          },
          players: {
            create: memberSessionConfigs,
          },
        },
      });

      if (normalizedGuests.length > 0) {
        const createdGuests = await Promise.all(
          normalizedGuests.map((guest) =>
            tx.user.create({
              data: {
                name: guest.name,
                email: null,
                passwordHash: null,
                isClaimed: false,
                elo: guest.initialElo,
                gender: guest.gender,
                partnerPreference: guest.partnerPreference,
              },
              select: { id: true, gender: true, partnerPreference: true },
            })
          )
        );

        await tx.sessionPlayer.createMany({
          data: createdGuests.map((guest, idx) => ({
            sessionId: createdSession.id,
            userId: guest.id,
            isGuest: true,
            gender: guest.gender,
            partnerPreference:
              (guest.partnerPreference as PartnerPreference | undefined) ??
              normalizedGuests[idx].partnerPreference,
            sessionPoints: 0,
            joinedAt: new Date(),
            availableSince: new Date(),
          })),
        });
      }

      return tx.session.findUnique({
        where: { id: createdSession.id },
        include: {
          courts: true,
          players: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  elo: true,
                  gender: true,
                  partnerPreference: true,
                },
              },
            },
          },
        },
      });
    });

    if (!newSession) {
      return NextResponse.json({ error: "Failed to load created tournament" }, { status: 500 });
    }

    const players =
      newSession.communityId && newSession.players.length > 0
        ? withCommunityElo(
            newSession.players,
            await getCommunityEloByUserId(
              newSession.communityId,
              newSession.players.map((p) => p.userId)
            )
          )
        : newSession.players;

    return NextResponse.json({ ...newSession, players });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("MIXICANO requires")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Session creation error details:", error);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(request.url);
    const communityId = url.searchParams.get("communityId");
    if (!communityId) {
      return NextResponse.json([]);
    }

    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: session.user.id,
        },
      },
    });

    if (!membership && !session.user.isAdmin) {
      return NextResponse.json({ error: "Not authorized for this community" }, { status: 403 });
    }

    const sessions = await prisma.session.findMany({
      where: { communityId },
      orderBy: { createdAt: "desc" },
      include: {
        courts: true,
        players: {
          include: { user: { select: { id: true, name: true, elo: true } } },
        },
      },
    });

    if (sessions.length === 0) {
      return NextResponse.json(sessions);
    }

    const userIds = Array.from(new Set(sessions.flatMap((s) => s.players.map((p) => p.userId))));
    const communityEloByUserId = await getCommunityEloByUserId(communityId, userIds);
    const sessionsWithCommunityElo = sessions.map((s) => ({
      ...s,
      players: withCommunityElo(s.players, communityEloByUserId),
    }));

    return NextResponse.json(sessionsWithCommunityElo);
  } catch (error) {
    console.error("Session list error:", error);
    return NextResponse.json({ error: "Failed to load tournaments" }, { status: 500 });
  }
}
