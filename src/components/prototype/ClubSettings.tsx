"use client";
import { useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Camera, CaretRight, LinkSimple, Trash } from "@phosphor-icons/react";
import type { ClubPageClub } from "@/components/club/clubTypes";
import { uploadClubAvatar, deleteClubAvatar } from "@/lib/avatarClient";
import { createCroppedAvatarFile } from "@/lib/avatarCrop";
import { Avatar, Sheet, ErrorText } from "./Primitives";
import { api, useAction } from "./api";

export function ClubSettings({ club, allowJoinRequests, busy, onInvite, onToggleJoins, refresh, onDeleted }: {
  club: ClubPageClub; allowJoinRequests?: boolean; busy: boolean; onInvite: () => void;
  onToggleJoins: () => void; refresh: () => Promise<unknown>; onDeleted: () => Promise<void>;
}) {
  const [name, setName] = useState(club.name);
  const [rules, setRules] = useState(club.rules ?? "");
  const [notice, setNotice] = useState("");
  const [source, setSource] = useState<{ file: File; url: string } | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const upload = useRef<HTMLInputElement>(null);
  const action = useAction();
  const endpoint = "/api/clubs/" + club.id;
  const changed = name.trim() !== club.name || rules.trim() !== (club.rules ?? "");
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);
  function choose(file?: File) {
    if (!file) return;
    action.setError(""); setNotice("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 20 * 1024 * 1024) return action.setError("Choose a JPG, PNG or WebP image smaller than 20 MB.");
    setCrop({ x: 0, y: 0 }); setZoom(1); setArea(null); setSource({ file, url: URL.createObjectURL(file) });
  }
  return <div className="club-settings">
    <fieldset disabled={action.busy || busy} className="club-settings-fields">
      <div className="club-settings-photo">
        <button className="club-photo-button" aria-label="Change club photo" onClick={() => upload.current?.click()}><Avatar large name={club.name} url={club.avatarUrl} /><span><Camera size={17} weight="bold" /></span></button>
        <div><button className="text-button" onClick={() => upload.current?.click()}>{club.avatarUrl ? "Change photo" : "Add club photo"}</button>{club.avatarUrl && <button className="text-button muted" onClick={() => void action.run(async () => { await deleteClubAvatar(club.id); await refresh(); setNotice("Club photo removed."); })}>Remove photo</button>}</div>
        <input ref={upload} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="Club photo file" onChange={e => { choose(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <form onSubmit={e => { e.preventDefault(); setNotice(""); void action.run(async () => { await api(endpoint, "PATCH", { name: name.trim(), rules: rules.trim() }); await refresh(); setNotice("Club details saved."); }); }}>
        <label className="field-label">Club name<input value={name} onChange={e => setName(e.target.value)} minLength={3} required /></label>
        <label className="field-label">Club rules (optional)<textarea aria-label="Club rules" value={rules} onChange={e => setRules(e.target.value)} maxLength={3000} rows={5} placeholder="e.g. Arrive 10 minutes early and let the host know if you can’t make it." /></label>
        <p className="club-settings-hint">Shown on your club overview.</p>
        <button type="submit" className="primary full" disabled={!changed || name.trim().length < 3 || action.busy}>{action.busy ? "Saving…" : "Save changes"}</button>
      </form>
      <section className="club-settings-section" aria-label="Joining the club"><h3>Joining the club</h3><div className="club-settings-rows">
        <button className="club-setting-row" onClick={onInvite}><LinkSimple size={22} /><span><strong>Invite link</strong><small>Share your club with players</small></span><CaretRight size={18} /></button>
        <button role="switch" aria-label="Allow join requests" aria-checked={allowJoinRequests ?? false} disabled={allowJoinRequests === undefined || busy} className="toggle-row" onClick={onToggleJoins}><span><strong>Allow join requests</strong><small>Players can ask to join</small></span><span className={"switch " + (allowJoinRequests ? "on" : "")} /></button>
      </div></section>
      {!club.isTutorial && <div className="club-settings-danger"><button className="text-button danger" onClick={() => { action.setError(""); setConfirmation(""); setDeleting(true); }}><Trash size={18} />Delete club</button></div>}
    </fieldset>
    <ErrorText error={action.error} />{notice && <p className="club-settings-notice" role="status">{notice}</p>}
    <Sheet open={!!source} title="Club photo" busy={action.busy} onClose={() => setSource(null)}>{source && <>
      <div className="club-crop-area"><Cropper image={source.url} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setArea(pixels)} /></div>
      <label className="field-label">Zoom<input aria-label="Photo zoom" type="range" min={1} max={3} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
      <ErrorText error={action.error} /><button className="primary full" disabled={!area || action.busy} onClick={() => void action.run(async () => { if (!area) return; const file = await createCroppedAvatarFile({ src: source.url, crop: area, fileName: source.file.name }); await uploadClubAvatar(club.id, file); await refresh(); setSource(null); setNotice("Club photo updated."); })}>Save photo</button>
    </>}</Sheet>
    <Sheet open={deleting} title="Delete club?" busy={action.busy} onClose={() => setDeleting(false)}>
      <p>This permanently deletes {club.name} and its session history.</p><label className="field-label">Type DELETE to confirm<input aria-label="Deletion confirmation" value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label><ErrorText error={action.error} />
      <button className="primary full" disabled={confirmation !== "DELETE" || action.busy} onClick={() => void action.run(async () => { await api(endpoint, "DELETE", { confirmation }); await onDeleted(); })}>Delete club</button>
      <button className="text-button full" onClick={() => setDeleting(false)}>Keep club</button>
    </Sheet>
  </div>;
}
