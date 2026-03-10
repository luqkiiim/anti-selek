import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { name, email, elo, isActive } = body;

    if (
      name !== undefined &&
      (typeof name !== "string" || name.trim().length === 0)
    ) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }

    if (
      email !== undefined &&
      email !== null &&
      (typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    ) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    if (
      elo !== undefined &&
      (!Number.isInteger(elo) || elo < 0 || elo > 5000)
    ) {
      return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
    }

    if (isActive !== undefined && typeof isActive !== "boolean") {
      return NextResponse.json({ error: "Invalid isActive value" }, { status: 400 });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : undefined,
        email: email !== undefined ? (email ? email.trim() : null) : undefined,
        elo: elo !== undefined ? elo : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Admin update player error details:", error);
    return NextResponse.json(
      { error: "Failed to update player" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    // Don't allow deleting yourself
    if (id === session.user.id) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Delete the user (cascades will handle SessionPlayer and Match records)
    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin delete player error details:", error);
    return NextResponse.json(
      { error: "Failed to delete player" },
      { status: 500 }
    );
  }
}
