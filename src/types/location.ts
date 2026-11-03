export interface LocationSuggestion {
  placeId: string;
  name: string;
  address: string;
  mapUrl: string;
}

export interface LocationSelection {
  venue: string | null;
  venueMapUrl: string | null;
}
