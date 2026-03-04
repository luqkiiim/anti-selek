import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { email, password, name } = body as {
      email?: unknown;
      password?: unknown;
      name?: unknown;
    };

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof name !== "string"
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();
    if (!normalizedEmail || !normalizedName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Check if email already registered
    const existingByEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingByEmail) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 400 }
      );
    }

    // Check if there's an unclaimed profile with the same name
    const existingByName = await prisma.user.findFirst({
      where: { 
        name: normalizedName,
        isClaimed: false
      },
    });

    const passwordHash = await bcrypt.hash(password, 10);

    let user;
    if (existingByName) {
      // Claim the existing profile
      user = await prisma.user.update({
        where: { id: existingByName.id },
        data: {
          email: normalizedEmail,
          passwordHash,
          isClaimed: true,
        },
      });
    } else {
      // Create new claimed user
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: normalizedName,
          isClaimed: true,
        },
      });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      isClaimed: user.isClaimed,
    });
  } catch (error) {
    console.error("Signup error details:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
