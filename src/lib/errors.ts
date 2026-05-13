import { NextResponse } from "next/server";

export function logError(context: string, error: unknown) {
  console.error(`${context}:`, error);
}

export function safeErrorResponse() {
  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}
