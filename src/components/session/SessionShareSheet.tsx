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
  const [message, setMessage] = useState(() => buildSessionShareMessage(session, sessionUrl));
  const [customised, setCustomised] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const saving = useRef(false);
  const canEdit = session.viewerCanEditDetails === true && session.status !== "COMPLETED";
  function resetMessage() {
    setMessage(buildSessionShareMessage(session, sessionUrl));
    setCustomised(false); setCopied(false); setError("");
  }
  async function saveDetails() {
    if (saving.current || !canEdit) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const details = sessionDetailsFromDraft(draft, session.courts.map(court => court.courtNumber));
      const saved = await api<{ details: SessionDetails }>(`/api/sessions/${encodeURIComponent(session.code)}/details`, "PATCH", { details });
      setDraft(sessionDetailsDraft(saved.details));
      onSaved(saved.details);
      if (!customised) setMessage(buildSessionShareMessage({ ...session, details: saved.details }, sessionUrl));
      setCopied(false); setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save details."); }
    finally { saving.current = false; setBusy(false); }
  }
  async function copyMessage() {
    setCopied(false); setError("");
    try {
      await navigator.clipboard.writeText(message);
      if (messageRef.current?.value === message) setCopied(true);
    } catch {
      messageRef.current?.focus(); messageRef.current?.select();
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
    {editing ? <SessionDetailsForm value={draft} onChange={setDraft} collapsible={false} /> : <div className={styles.preview}>
      <div className={styles.previewHeading}><span><ShareNetwork size={18} aria-hidden="true" />Message</span>
        {canEdit && <button type="button" className="text-button" onClick={() => { setDraft(sessionDetailsDraft(session.details)); setEditing(true); setError(""); }}>Edit details</button>}
      </div>
      <textarea ref={messageRef} className={styles.message} aria-label="Session message" value={message} onChange={e => { setMessage(e.target.value); setCustomised(true); setCopied(false); setError(""); }} spellCheck={false} />
      <button type="button" className="text-button" onClick={resetMessage}>Reset message</button>
      <span className={styles.srOnly} role="status">{copied ? "Message copied to clipboard" : ""}</span>
    </div>}
  </Sheet>;
}
