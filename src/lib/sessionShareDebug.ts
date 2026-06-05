interface SearchParamsLike {
  get(name: string): string | null;
}

export function isSessionShareDebugEnabled(
  searchParams: SearchParamsLike | null | undefined
) {
  return searchParams?.get("shareDebug") === "1";
}
