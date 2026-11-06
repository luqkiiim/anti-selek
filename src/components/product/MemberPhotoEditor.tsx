"use client";
import { useEffect, useRef, useState } from "react";
import { Camera } from "@phosphor-icons/react";
import Cropper, { type Area } from "react-easy-crop";
import { createCroppedAvatarFile } from "@/lib/avatarCrop";
import { getAvatarSourceValidationError } from "@/lib/avatar";
import type { ClubPageMember } from "@/components/club/clubTypes";
import { Avatar, ErrorText } from "./Primitives";
import { adminApi } from "@/lib/adminClient";
import { useAdminAction } from "@/components/club-admin/useAdminAction";
import "./account-settings.css";

export function MemberPhotoEditor({ member, clubId, onSaved, refresh, onBusyChange }: {
  member: ClubPageMember; clubId: string; onSaved: (url: string | null) => void; refresh: () => Promise<unknown>; onBusyChange?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<{ url: string; name: string } | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const action = useAdminAction(refresh);
  useEffect(() => { onBusyChange?.(action.busy); return () => onBusyChange?.(false); }, [action.busy, onBusyChange]);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);
  if (member.isClaimed) return <div className="account-photo"><Avatar large name={member.name} url={member.avatarUrl} /></div>;
  return <div className="member-photo-editor">
    {source ? <div className="account-crop">
      <div className="account-crop-area"><Cropper image={source.url} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setArea(pixels)} /></div>
      <label className="field-label">Zoom<input type="range" min={1} max={3} step={0.01} value={zoom} disabled={action.busy} onChange={e => setZoom(Number(e.target.value))} /></label>
      <div className="account-actions"><button type="button" className="secondary" disabled={action.busy} onClick={() => setSource(null)}>Cancel</button><button type="button" className="primary" disabled={!area || action.busy || action.uncertain} onClick={() => void action.run(async signal => {
        if (!area) throw new Error("Choose a crop first.");
        const file = await createCroppedAvatarFile({ src: source.url, crop: area, fileName: source.name });
        const form = new FormData(); form.append("avatar", file);
        return adminApi<{ avatarUrl: string | null }>(`/api/users/${encodeURIComponent(member.id)}/avatar?clubId=${encodeURIComponent(clubId)}`, "POST", form, { signal });
      }, result => { setSource(null); onSaved(result.avatarUrl); })}>{action.busy ? "Saving…" : "Save photo"}</button></div>
    </div> : <div className="account-photo">
      <button type="button" className="account-photo-button" aria-label="Change player photo" onClick={() => input.current?.click()}><Avatar large name={member.name} url={member.avatarUrl} /><span><Camera size={17} weight="bold" /></span></button>
      <button type="button" className="text-button" onClick={() => input.current?.click()}>{member.avatarUrl ? "Change photo" : "Add photo"}</button>
    </div>}
    <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" aria-label="Player photo file" onChange={e => {
      const file = e.target.files?.[0]; e.target.value = "";
      if (!file) return;
      const error = getAvatarSourceValidationError({ mimeType: file.type, size: file.size });
      action.setError(error || ""); if (error) return;
      setCrop({ x: 0, y: 0 }); setZoom(1); setArea(null);
      setSource({ url: URL.createObjectURL(file), name: file.name });
    }} />
    <ErrorText error={action.error} />
    {(action.refreshWarning || action.uncertain) && <div role="status">{action.refreshWarning && <p>{action.refreshWarning}</p>}<button type="button" className="text-button" disabled={action.refreshing} onClick={() => void action.retryRefresh()}>{action.refreshing ? "Refreshing…" : "Refresh details"}</button></div>}
  </div>;
}
