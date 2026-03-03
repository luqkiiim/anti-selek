import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if email already registered
    const existingByEmail = await prisma.user.findUnique({
      where: { email },
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
        name,
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
          email,
          passwordHash,
          isClaimed: true,
        },
      });
    } else {
      // Create new claimed user
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name,
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
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
