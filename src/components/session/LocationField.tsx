"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import type { LocationSelection, LocationSuggestion } from "@/types/location";
import styles from "./SessionSharing.module.css";

export function LocationField({ venue, venueMapUrl, clubId, onChange }: LocationSelection & {
  clubId?: string | null;
  onChange: (location: LocationSelection) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [{ message, loading, failed }, setSearchState] = useState({ message: "", loading: false, failed: false });
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [editingMap, setEditingMap] = useState(false);
  const endpoint = clubId ? `/api/clubs/${encodeURIComponent(clubId)}/locations` : null;

  useEffect(() => {
    if (query.trim().length < 2 || !endpoint) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchState({ message: "Searching locations…", loading: true, failed: false });
      void fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }), signal: controller.signal,
      }).then(async response => {
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(data.error || "Unable to find locations.");
        setSuggestions(data.suggestions);
        setActiveIndex(-1);
        setSearchState({ message: data.suggestions.length ? "" : "No locations found.", loading: false, failed: false });
      }).catch(error => {
        if (!controller.signal.aborted) setSearchState({ message: error instanceof Error ? error.message : "Unable to find locations.", loading: false, failed: true });
      });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, endpoint, searchAttempt]);

  function choose(place: LocationSuggestion) {
    onChange({ venue: place.name, venueMapUrl: place.mapUrl });
    setSuggestions([]); setOpen(false); setQuery(""); setSearchState({ message: "", loading: false, failed: false }); setEditingMap(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (open && suggestions.length) choose(suggestions[Math.max(0, activeIndex)]);
      return;
    }
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); setOpen(false);
    } else if (suggestions.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setActiveIndex(index => event.key === "ArrowDown" ? (index + 1) % suggestions.length : (index <= 0 ? suggestions.length : index) - 1);
    }
  }

  return <div className={styles.location}>
    <label className={styles.field} htmlFor={id}>Location</label>
    <div className={styles.locationSearch}>
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open && suggestions.length > 0}
        aria-controls={`${id}-results`} aria-busy={loading} aria-activedescendant={activeIndex >= 0 && open && suggestions[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
        aria-describedby={message ? `${id}-status` : undefined} value={venue ?? ""} maxLength={160} placeholder="Search for a venue" autoComplete="off"
        onChange={event => {
          setQuery(event.target.value); setOpen(true); setSuggestions([]); setActiveIndex(-1); setSearchState({ message: "", loading: false, failed: false });
          onChange({ venue: event.target.value || null, venueMapUrl: null });
        }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={handleKeyDown} />
      {open && suggestions.length > 0 && <div className={styles.locationResults}>
        <div id={`${id}-results`} role="listbox" aria-label="Locations">{suggestions.map((place, index) => <button
          type="button" role="option" id={`${id}-option-${index}`} key={place.placeId} tabIndex={-1} aria-selected={index === activeIndex}
          className={styles.locationOption} onPointerDown={event => event.preventDefault()} onClick={() => choose(place)}>
          <strong>{place.name}</strong>{place.address && <span>{place.address}</span>}
        </button>)}</div>
        <div className={styles.locationAttribution}>
          <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Powered by Geoapify</a>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>
        </div>
      </div>}
    </div>
    {message && <div className={styles.locationStatus}>
      <p id={`${id}-status`} className={failed ? styles.error : styles.hint} role="status">{message}</p>
      {failed && <button type="button" className="text-button" onClick={() => { setOpen(true); setSearchAttempt(attempt => attempt + 1); }}>Try again</button>}
    </div>}
    <div className={styles.locationLinks}>
      {venueMapUrl && <a href={venueMapUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>}
      <button type="button" className="text-button" aria-expanded={editingMap} onClick={() => setEditingMap(value => !value)}>{venueMapUrl ? "Edit map link" : "Add map link"}</button>
    </div>
    {editingMap && <label className={styles.field}>Map link<input type="url" value={venueMapUrl ?? ""} maxLength={1000} placeholder="https://" onChange={event => onChange({ venue, venueMapUrl: event.target.value || null })} /></label>}
  </div>;
}
