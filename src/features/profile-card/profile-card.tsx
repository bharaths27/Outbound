"use client";

// Discord-style profile card: banner, photo, name, class year, school sticker, join date, bio,
// earned badges and a few numbers. On your own card: Edit profile. On someone else's: a private
// note only you can see.

import { CalendarDays, Camera, GraduationCap, Loader2, NotebookPen, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { data } from "@/lib/data";
import type { BadgeId, Profile, School } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { BADGE_ART, BadgePatch } from "@/features/badges/badge-patch";
import { showBadge } from "@/features/badges/unlock";
import { SchoolLogo } from "@/features/schools/school-logo";
import { BANNERS, GRAD_YEARS, bannerCss } from "./banners";
import { squarePhoto } from "./resize";

const joined = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });

export function Avatar({ profile, school, size }: { profile: Profile; school: School | null; size: number }) {
  const initial = (profile.display_name ?? profile.email).trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-gold font-display font-bold text-gold-foreground"
      style={{ width: size, height: size, fontSize: size * 0.42, boxShadow: `0 0 0 4px var(--background), 0 0 0 7px ${school?.color ?? "var(--border-strong)"}` }}
    >
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- user photo from storage or a data URL
        <img src={profile.avatar_url} alt="" className="size-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}

export function ProfileCard({
  profile: initial,
  school,
  badges,
  stats,
  isMe,
  signedIn,
  aside,
}: {
  profile: Profile;
  school: School | null;
  badges: BadgeId[];
  stats: { label: string; value: number | string }[];
  isMe: boolean;
  signedIn: boolean;
  aside?: React.ReactNode;
}) {
  const [profile, setProfile] = useState(initial);
  const [editing, setEditing] = useState(false);
  useEffect(() => setProfile(initial), [initial]);
  const name = profile.display_name ?? "Explorer";

  return (
    <section aria-label={`${name}'s profile`} className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-card" data-testid="profile-card">
      <div className="relative h-28 desk:h-36" style={{ background: bannerCss(profile.banner) }}>
        {school && <SchoolLogo school={school} height={58} tilt={8} className="absolute top-3 right-3 opacity-95 desk:h-[72px]" />}
        {isMe && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="absolute right-3 bottom-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-full bg-black/35 px-3 text-[13px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/50"
          >
            <Pencil className="size-3.5" aria-hidden /> Edit profile
          </button>
        )}
      </div>
      <div className="relative px-4 pb-4 desk:px-6">
        <div className="pointer-events-none -mt-11 flex items-end justify-between gap-3 *:pointer-events-auto">
          <Avatar profile={profile} school={school} size={88} />
          {aside && <div className="pb-1">{aside}</div>}
        </div>
        <h1 className="mt-2 font-display text-[28px] leading-tight font-semibold">{name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          {school && <span className="font-semibold text-ink-2">{school.name}</span>}
          {profile.grad_year && (
            <span className="inline-flex items-center gap-1">
              <GraduationCap className="size-3.5" aria-hidden /> Class of {profile.grad_year}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" aria-hidden /> Joined {joined(profile.created_at)}
          </span>
          {profile.is_demo && <span className="rounded-full bg-sample px-2 py-px text-[10px] font-bold text-sample-foreground uppercase">Demo</span>}
        </p>
        {profile.bio && <p className="mt-2.5 text-sm leading-relaxed text-ink-2">{profile.bio}</p>}

        {badges.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">Badges</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {badges.map((b) => (
                <li key={b}>
                  <button
                    type="button"
                    onClick={() => showBadge(b)}
                    title={`${BADGE_ART[b].name}: ${BADGE_ART[b].how}`}
                    aria-label={`${BADGE_ART[b].name} badge`}
                    className="block transition-transform hover:-rotate-6 hover:scale-110"
                  >
                    <BadgePatch id={b} size={44} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <dl className="mt-3 flex flex-wrap gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-sand/70 px-3 py-1.5">
              <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
              <dd className="font-display text-lg leading-tight font-semibold text-maroon tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>

        {!isMe && signedIn && <PrivateNote subjectId={profile.id} name={name} />}
      </div>
      {isMe && <EditProfile open={editing} onOpenChange={setEditing} profile={profile} onSaved={setProfile} />}
    </section>
  );
}

function PrivateNote({ subjectId, name }: { subjectId: string; name: string }) {
  const [text, setText] = useState<string | null>(null);
  const saved = useRef("");
  useEffect(() => {
    data
      .getNote(subjectId)
      .then((t) => {
        saved.current = t;
        setText(t);
      })
      .catch(() => setText(""));
  }, [subjectId]);
  async function save() {
    if (text === null || text.trim() === saved.current) return;
    try {
      await data.setNote(subjectId, text);
      saved.current = text.trim();
      toast("Note saved. Only you can see it.");
    } catch {
      toast.error("Your note didn't save.");
    }
  }
  return (
    <div className="mt-4 rounded-xl border border-dashed border-border-strong p-2.5">
      <label htmlFor={`note-${subjectId}`} className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
        <NotebookPen className="size-3.5" aria-hidden /> Note <span className="font-normal tracking-normal normal-case">· only you can see this</span>
      </label>
      <textarea
        id={`note-${subjectId}`}
        value={text ?? ""}
        disabled={text === null}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        maxLength={500}
        rows={2}
        placeholder={`Add a note about ${name} (met at BostonHacks, likes ramen…)`}
        className="mt-1 w-full resize-none bg-transparent text-base outline-none placeholder:text-muted-foreground/70 desk:text-sm"
      />
    </div>
  );
}

function EditProfile({ open, onOpenChange, profile, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; profile: Profile; onSaved: (p: Profile) => void }) {
  const [name, setName] = useState(profile.display_name ?? "");
  const [year, setYear] = useState<number | null>(profile.grad_year ?? null);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [banner, setBanner] = useState(profile.banner ?? "maroon");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(profile.display_name ?? "");
    setYear(profile.grad_year ?? null);
    setBio(profile.bio ?? "");
    setBanner(profile.banner ?? "maroon");
  }, [open, profile]);

  async function pickPhoto(f: File | undefined) {
    if (!f) return;
    setPhotoBusy(true);
    try {
      onSaved(await data.uploadAvatar(await squarePhoto(f)));
      toast("Photo updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That photo didn't upload.");
    } finally {
      setPhotoBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Add a display name.");
    setBusy(true);
    try {
      onSaved(await data.updateProfileExtras({ display_name: name, grad_year: year, bio, banner }));
      toast("Profile saved");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  const preview: Profile = { ...profile, display_name: name || profile.display_name, banner };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl p-0 sm:max-w-[460px]">
        <div className="h-20 rounded-t-3xl" style={{ background: bannerCss(banner) }} />
        <form onSubmit={save} className="flex flex-col gap-4 px-5 pb-5">
          <div className="-mt-10 flex items-end gap-3">
            <Avatar profile={preview} school={null} size={76} />
            <div className="flex gap-1.5 pb-1">
              <input ref={file} id="avatar-file" type="file" accept="image/*" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0])} />
              <label htmlFor="avatar-file" className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-maroon px-3 text-[13px] font-semibold text-white hover:bg-maroon-600", photoBusy && "pointer-events-none opacity-60")}>
                {photoBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Camera className="size-3.5" aria-hidden />}
                {profile.avatar_url ? "Change photo" : "Add photo"}
              </label>
              {profile.avatar_url && (
                <button
                  type="button"
                  onClick={async () => onSaved(await data.removeAvatar().catch(() => profile))}
                  aria-label="Remove photo"
                  className="grid size-8 place-items-center rounded-full border border-border-strong text-muted-foreground hover:bg-sand"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          </div>
          <div>
            <DialogTitle className="font-display text-2xl">Edit profile</DialogTitle>
            <DialogDescription className="text-[13px]">Friends and (if your profile is public) other players see this.</DialogDescription>
          </div>

          <label className="flex flex-col gap-1 text-sm font-bold">
            Display name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="h-10 rounded-lg border border-input bg-surface px-3 text-base font-normal outline-none focus:border-maroon desk:text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Grad year <span className="text-xs font-normal text-muted-foreground">Optional</span>
            <select
              value={year ?? ""}
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
              className="h-10 rounded-lg border border-input bg-surface px-3 text-base font-normal outline-none focus:border-maroon desk:text-sm"
            >
              <option value="">Don&apos;t show</option>
              {GRAD_YEARS.map((y) => (
                <option key={y} value={y}>
                  Class of {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            <span className="flex justify-between">
              Bio <span className="text-xs font-normal text-muted-foreground tabular-nums">{bio.length}/160</span>
            </span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={160}
              rows={2}
              placeholder="Green Line regular. Will travel for dumplings."
              className="resize-none rounded-lg border border-input bg-surface px-3 py-2 text-base font-normal outline-none focus:border-maroon desk:text-sm"
            />
          </label>
          <fieldset>
            <legend className="text-sm font-bold">Banner</legend>
            <div className="mt-1.5 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Banner">
              {BANNERS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={banner === b.id}
                  aria-label={b.label}
                  title={b.label}
                  onClick={() => setBanner(b.id)}
                  className={cn("h-11 rounded-xl ring-offset-2 ring-offset-background transition-transform hover:scale-105", banner === b.id ? "ring-3 ring-maroon" : "ring-1 ring-border")}
                  style={{ background: b.css }}
                />
              ))}
            </div>
          </fieldset>
          <button type="submit" disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-maroon text-sm font-bold text-white hover:bg-maroon-600 disabled:opacity-60">
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save profile
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
