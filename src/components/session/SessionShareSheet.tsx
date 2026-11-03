"use client";

import { useRef, useState } from "react";
import { Copy, Check, ShareNetwork } from "@phosphor-icons/react";
import { Sheet } from "@/components/prototype/Primitives";
import { api } from "@/components/prototype/api";
import { buildSessionShareMessage } from "@/lib/sessionShareMessage";
import type { SessionDetails } from "@/lib/sessionDetails";
import type { SessionData } from "./sessionTypes";
import { SessionDetailsForm, sessionDetailsDraft, sessionDetailsFromDraft } from "./SessionDetailsForm";
import styles from "./SessionSharing.module.css";

export function SessionShareSheet({ session, sessionUrl, initialEditing = false, onSaved, onClose }: {
  session: SessionData;
  sessionUrl: string;
  initialEditing?: boolean;
  onSaved: (details: SessionDetails) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(initialEditing);
  const [draft, setDraft] = useState(() => sessionDetailsDraft(session.details));
  const [busy, setBusy] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const messageRef = useRef<HTMLDivElement>(null);
  const saving = useRef(false);
  const message = buildSessionShareMessage(session, sessionUrl);
  const copied = copiedMessage === message;
  const canEdit = session.viewerCanEditDetails === true && session.status !== "COMPLETED";
  async function saveDetails() {
    if (saving.current || !canEdit) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const details = sessionDetailsFromDraft(draft, session.courts.map(court => court.courtNumber));
      const saved = await api<{ details: SessionDetails }>(`/api/sessions/${encodeURIComponent(session.code)}/details`, "PATCH", { details });
      setDraft(sessionDetailsDraft(saved.details));
      onSaved(saved.details);
      setCopiedMessage(null); setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save details."); }
    finally { saving.current = false; setBusy(false); }
  }
  async function copyMessage() {
    setCopiedMessage(null); setError("");
    try {
      await navigator.clipboard.writeText(message);
      setCopiedMessage(message);
    } catch {
      if (messageRef.current) {
        messageRef.current.focus({ preventScroll: true });
        const range = document.createRange();
        range.selectNodeContents(messageRef.current);
        const selection = window.getSelection();
        selection?.removeAllRanges(); selection?.addRange(range);
      }
      setError("Copying is unavailable. Select and copy the message below.");
    }
  }
  return <Sheet open title={editing ? "Session details" : "Share session"} onClose={onClose} busy={busy}
    footer={editing ? <div className={styles.actions}>
      <button type="button" className="secondary" onClick={() => { setDraft(sessionDetailsDraft(session.details)); setEditing(false); setError(""); }}>Cancel</button>
      <button type="button" className="primary" onClick={() => void saveDetails()} disabled={!canEdit}>{busy ? "Saving…" : "Save details"}</button>
    </div> : <button type="button" className="primary full" disabled={!message.trim()} onClick={() => void copyMessage()}>
      {copied ? <Check size={20} aria-hidden="true" /> : <Copy size={20} aria-hidden="true" />}{copied ? "Copied" : "Copy message"}
    </button>}>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {editing ? <SessionDetailsForm value={draft} onChange={setDraft} courtNumbers={session.courts.map(court => court.courtNumber)} collapsible={false} /> : <div className={styles.preview}>
      <div className={styles.previewHeading}><span><ShareNetwork size={18} aria-hidden="true" />Message</span>
        {canEdit && <button type="button" className="text-button" onClick={() => { setDraft(sessionDetailsDraft(session.details)); setEditing(true); setError(""); }}>Edit details</button>}
      </div>
      <div ref={messageRef} className={styles.message} role="region" aria-label="Session message" tabIndex={-1}>{message}</div>
      <span className={styles.srOnly} role="status">{copied ? "Message copied to clipboard" : ""}</span>
    </div>}
  </Sheet>;
}
