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
  const [message, setMessage] = useState("");
  const [editingMap, setEditingMap] = useState(false);
  const endpoint = clubId ? `/api/clubs/${encodeURIComponent(clubId)}/locations` : null;

  useEffect(() => {
    if (!open || query.trim().length < 2 || !endpoint) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }), signal: controller.signal,
      }).then(async response => {
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(data.error || "Unable to find locations.");
        setSuggestions(data.suggestions);
        setActiveIndex(-1);
        setMessage(data.suggestions.length ? "" : "No locations found.");
      }).catch(error => {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Unable to find locations.");
      });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open, endpoint]);

  function choose(place: LocationSuggestion) {
    onChange({ venue: place.name, venueMapUrl: place.mapUrl });
    setSuggestions([]); setOpen(false); setQuery(""); setMessage(""); setEditingMap(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); setOpen(false);
    } else if (suggestions.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setActiveIndex(index => event.key === "ArrowDown" ? (index + 1) % suggestions.length : (index <= 0 ? suggestions.length : index) - 1);
    } else if (event.key === "Enter" && suggestions.length) {
      event.preventDefault(); choose(suggestions[Math.max(0, activeIndex)]);
    }
  }

  return <div className={styles.location}>
    <label className={styles.field} htmlFor={id}>Location</label>
    <div className={styles.locationSearch}>
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open && suggestions.length > 0}
        aria-controls={`${id}-results`} aria-activedescendant={activeIndex >= 0 && open && suggestions[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
        aria-describedby={message ? `${id}-status` : undefined} value={venue ?? ""} maxLength={160} placeholder="Search for a venue" autoComplete="off"
        onChange={event => {
          setQuery(event.target.value); setOpen(true); setSuggestions([]); setActiveIndex(-1); setMessage("");
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
    {message && <p id={`${id}-status`} className={styles.hint} role="status">{message}</p>}
    <div className={styles.locationLinks}>
      {venueMapUrl && <a href={venueMapUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>}
      <button type="button" className="text-button" aria-expanded={editingMap} onClick={() => setEditingMap(value => !value)}>{venueMapUrl ? "Edit map link" : "Add map link"}</button>
    </div>
    {editingMap && <label className={styles.field}>Map link<input type="url" value={venueMapUrl ?? ""} maxLength={1000} placeholder="https://" onChange={event => onChange({ venue, venueMapUrl: event.target.value || null })} /></label>}
  </div>;
}
