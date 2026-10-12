"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Camera } from "@phosphor-icons/react";
import Cropper, { type Area } from "react-easy-crop";
import { createCroppedAvatarFile } from "@/lib/avatarCrop";
import { uploadAccountAvatar, deleteAccountAvatar } from "@/lib/avatarClient";
import { Avatar, ErrorText, Sheet } from "./Primitives";
import { api, useAction, useResource } from "./api";
import { getMixedSideOverrideOptionForGender } from "@/lib/mixedSide";
import { MixedSide, PlayerGender } from "@/types/enums";
import "./account-settings.css";

export type AccountClubContext = { clubId: string; clubName: string; playerId: string; gender: PlayerGender; mixedSideOverride: MixedSide | null };

export type AccountUser = {
  id: string; name: string; email: string | null; gender: string;
  avatarUrl: string | null; canRenameName: boolean; canChangeGender: boolean;
  isClaimed: boolean; isQuickAccess: boolean;
};

export function AccountSettings({ open, onClose, onSaved, clubContext }: { open: boolean; onClose: () => void; onSaved: () => Promise<unknown>; clubContext?: AccountClubContext }) {
  const resource = useResource<{ user: AccountUser }>(open ? "/api/user/me" : null);
  return <Sheet open={open} title="Your account" onClose={onClose}>
    <ErrorText error={resource.error} />
    {resource.data ? <AccountForm key={resource.data.user.id} initial={resource.data.user} onSaved={onSaved} clubContext={clubContext} /> : !resource.error && <p role="status">Loading your account…</p>}
  </Sheet>;
}

function AccountForm({ initial, onSaved, clubContext }: { initial: AccountUser; onSaved: () => Promise<unknown>; clubContext?: AccountClubContext }) {
  const [user, setUser] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [gender, setGender] = useState(initial.gender);
  const [clubGender, setClubGender] = useState(clubContext?.gender);
  const [playerLevel, setPlayerLevel] = useState<string>(clubContext?.mixedSideOverride ?? "");
  const [savedLevel, setSavedLevel] = useState<string>(clubContext?.mixedSideOverride ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [source, setSource] = useState<{ file: File; url: string } | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { update } = useSession();
  const action = useAction();
  const editable = user.isClaimed && !user.isQuickAccess;
  const nameChanged = user.canRenameName && name.trim() !== user.name;
  const genderChanged = user.canChangeGender && gender !== user.gender;
  const levelOption = getMixedSideOverrideOptionForGender((genderChanged ? gender : clubGender ?? gender) as PlayerGender);
  const preferencesChanged = !!clubContext && playerLevel !== savedLevel;
  async function saveChanges() {
    setNotice("");
    await action.run(async () => {
      const body = { ...(nameChanged ? { name: name.trim() } : {}), ...(genderChanged ? { gender } : {}),
        ...(clubContext && (preferencesChanged || genderChanged) ? { clubPreferences: { clubId: clubContext.clubId, playerId: clubContext.playerId, mixedSideOverride: playerLevel || null } } : {}) };
      const result = await api<{ user: AccountUser; clubPreferences?: { mixedSideOverride: MixedSide | null } }>("/api/user/me", "PATCH", body);
      if (genderChanged) setClubGender(result.user.gender as PlayerGender);
      if (result.clubPreferences) {
        const confirmedLevel = result.clubPreferences.mixedSideOverride ?? "";
        setPlayerLevel(confirmedLevel); setSavedLevel(confirmedLevel);
      }
      setUser(result.user); setName(result.user.name); setGender(result.user.gender); setConfirmOpen(false); setNotice("Profile updated."); await refresh(result.user.name);
    });
  }
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);
  async function refresh(nextName?: string) {
    await update(nextName ? { name: nextName } : undefined);
    await onSaved();
  }
  function choosePhoto(file?: File) {
    if (!file) return;
    action.setError(""); setNotice("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return action.setError("Choose a JPG, PNG or WebP image.");
    if (file.size > 20 * 1024 * 1024) return action.setError("Choose a photo smaller than 20 MB.");
    setCrop({ x: 0, y: 0 }); setZoom(1); setArea(null);
    setSource({ file, url: URL.createObjectURL(file) });
  }
  return <div className="account-settings">
    <fieldset disabled={action.busy}>
      {source ? <div className="account-crop">
        <div className="account-crop-area"><Cropper image={source.url} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setArea(pixels)} /></div>
        <label className="field-label">Zoom<input type="range" min={1} max={3} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
        <div className="account-actions"><button type="button" className="secondary" onClick={() => setSource(null)}>Cancel</button><button type="button" className="primary" disabled={!area || action.busy} onClick={() => void action.run(async () => {
          if (!area) return;
          const file = await createCroppedAvatarFile({ src: source.url, crop: area, fileName: source.file.name });
          const result = await uploadAccountAvatar(file);
          setUser(u => ({ ...u, avatarUrl: result.avatarUrl })); setSource(null); setNotice("Photo updated."); await refresh();
        })}>{action.busy ? "Saving…" : "Save photo"}</button></div>
      </div> : <>
        <div className="account-photo">
          <button type="button" className="account-photo-button" disabled={!editable} aria-label="Change account photo" onClick={() => fileInput.current?.click()}><Avatar large name={user.name} url={user.avatarUrl} />{editable && <span><Camera size={17} weight="bold" /></span>}</button>
          {editable && <div><button type="button" className="text-button" onClick={() => fileInput.current?.click()}>{user.avatarUrl ? "Change photo" : "Add photo"}</button>{user.avatarUrl && <button type="button" className="text-button muted" onClick={() => void action.run(async () => { await deleteAccountAvatar(); setUser(u => ({ ...u, avatarUrl: null })); setNotice("Photo removed."); await refresh(); })}>Remove photo</button>}</div>}
          <input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/webp" aria-label="Profile photo file" onChange={e => { choosePhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <form onSubmit={e => { e.preventDefault(); if (action.busy) return; action.setError(""); if (nameChanged || genderChanged) setConfirmOpen(true); else void saveChanges(); }}>
          <label className="field-label">Account name<input value={name} onChange={e => setName(e.target.value)} disabled={!user.canRenameName} required /></label>
          <label className="field-label">Account gender<select aria-label="Account gender" value={gender} onChange={e => { setGender(e.target.value); setPlayerLevel(""); }} disabled={!user.canChangeGender} required><option value="UNSPECIFIED" disabled>Choose gender</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>
          {clubContext && <label className="field-label">Player level · {clubContext.clubName}<select aria-label="Player level" value={playerLevel} onChange={e => setPlayerLevel(e.target.value)} disabled={!levelOption}><option value="">Default</option>{levelOption && <option value={levelOption.value}>{levelOption.label}</option>}</select></label>}
          {(user.canRenameName || user.canChangeGender || clubContext) && <button type="submit" className="primary full" disabled={action.busy || (!nameChanged && !genderChanged && !preferencesChanged) || !name.trim()}>{action.busy ? "Saving…" : "Save changes"}</button>}
        </form>
        <button type="button" className="text-button account-signout" onClick={() => void signOut({ callbackUrl: "/signin" })}>Sign out</button>
      </>}
    </fieldset>
    <Sheet open={confirmOpen} title="Confirm account changes" busy={action.busy} onClose={() => setConfirmOpen(false)}>
      {nameChanged && <p>Account name: <strong>{user.name}</strong> → <strong>{name.trim()}</strong></p>}
      {genderChanged && <p>Account gender: <strong>{user.gender === "UNSPECIFIED" ? "Not set" : user.gender === "MALE" ? "Male" : "Female"}</strong> → <strong>{gender === "MALE" ? "Male" : "Female"}</strong></p>}
      <p>{nameChanged && genderChanged ? "You can change your name/gender only once." : nameChanged ? "You can change your name only once." : "You can change your gender only once."}</p>
      <ErrorText error={action.error} />
      <div className="account-actions"><button type="button" className="secondary" disabled={action.busy} onClick={() => setConfirmOpen(false)}>Cancel</button><button type="button" className="primary" disabled={action.busy} onClick={() => void saveChanges()}>{action.busy ? "Saving…" : "Confirm changes"}</button></div>
    </Sheet>
    <ErrorText error={confirmOpen ? "" : action.error} />{notice && <p className="account-notice" role="status">{notice}</p>}
  </div>;
}
