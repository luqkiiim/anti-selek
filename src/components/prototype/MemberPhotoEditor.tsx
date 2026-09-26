"use client";
import { useEffect, useRef, useState } from "react";
import { Camera } from "@phosphor-icons/react";
import Cropper, { type Area } from "react-easy-crop";
import { createCroppedAvatarFile } from "@/lib/avatarCrop";
import { getAvatarSourceValidationError } from "@/lib/avatar";
import { uploadUserAvatar } from "@/lib/avatarClient";
import type { ClubPageMember } from "@/components/club/clubTypes";
import { Avatar, ErrorText } from "./Primitives";
import { useAction } from "./api";
import "./account-settings.css";

export function MemberPhotoEditor({ member, clubId, onSaved }: {
  member: ClubPageMember; clubId: string; onSaved: (url: string | null) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<{ url: string; name: string } | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const action = useAction();
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);
  if (member.isClaimed) return <div className="account-photo"><Avatar large name={member.name} url={member.avatarUrl} /></div>;
  return <div className="member-photo-editor">
    {source ? <div className="account-crop">
      <div className="account-crop-area"><Cropper image={source.url} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setArea(pixels)} /></div>
      <label className="field-label">Zoom<input type="range" min={1} max={3} step={0.01} value={zoom} disabled={action.busy} onChange={e => setZoom(Number(e.target.value))} /></label>
      <div className="account-actions"><button type="button" className="secondary" disabled={action.busy} onClick={() => setSource(null)}>Cancel</button><button type="button" className="primary" disabled={!area || action.busy} onClick={() => void action.run(async () => {
        if (!area) return;
        const file = await createCroppedAvatarFile({ src: source.url, crop: area, fileName: source.name });
        const result = await uploadUserAvatar(member.id, file, clubId);
        setSource(null);
        await onSaved(result.avatarUrl);
      })}>{action.busy ? "Saving…" : "Save photo"}</button></div>
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
  </div>;
}
