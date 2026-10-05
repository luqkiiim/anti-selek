import { NextResponse } from "next/server";
import { withLegacySportingAliases } from "./sportingIdentity";

/** Legacy response aliases carry Player IDs; authentication stays account-based. */
export function sportingJson<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(withLegacySportingAliases(body), init);
}
