"use client";

// One squad: name, cross-school badge, members with school-color rings, and actions
// (copy invite link, leave). Used on the Squads tab and the join page.

import { Copy, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SquadMemberProfile, SquadWithMembers } from "@/lib/data/types";
import { initials, inviteUrl, isCrossSchool, squadName } from "./compete";

export function MemberAvatar({ member }: { member: SquadMemberProfile }) {
  return (
    <Avatar
      className="size-9 ring-2 ring-offset-2 ring-offset-card"
      // School colors appear only as small marks, like this ring (DESIGN.md).
      style={{ ["--tw-ring-color" as string]: member.school_color ?? "var(--border)" }}
      title={`${member.display_name ?? "Player"}, ${member.school_name}`}
    >
      {member.avatar_url && <AvatarImage src={member.avatar_url} alt="" />}
      <AvatarFallback className="type-tiny">{initials(member.display_name)}</AvatarFallback>
    </Avatar>
  );
}

export async function copyInvite(code: string) {
  const url = inviteUrl(window.location.origin, code);
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  } catch {
    toast(`Share this code: ${code}`, { description: url });
  }
}

export function SquadCard({
  squad,
  myId,
  onLeave,
  children,
}: {
  squad: SquadWithMembers;
  myId?: string | null;
  /** Shown as a "Leave" button when set. */
  onLeave?: () => void;
  /** Extra actions (e.g. "Join squad" on the join page). */
  children?: ReactNode;
}) {
  const cross = isCrossSchool(squad);
  const schools = [...new Map(squad.members.map((m) => [m.school_id, m.school_name])).values()];
  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="type-heading truncate">{squadName(squad)}</h3>
          <p className="type-small text-muted-foreground">
            <span className="tabular-nums">{squad.members.length}</span> {squad.members.length === 1 ? "member" : "members"} ·{" "}
            {schools.join(", ")}
          </p>
        </div>
        {cross && (
          <Badge variant="outline" className="shrink-0 border-gold">
            Cross-school
          </Badge>
        )}
      </header>

      <ul className="flex flex-wrap gap-3" aria-label="Members">
        {squad.members.map((m) => (
          <li key={m.user_id} className="flex flex-col items-center gap-1">
            <MemberAvatar member={m} />
            <span className="type-tiny max-w-16 truncate text-muted-foreground">
              {m.user_id === myId ? "You" : (m.display_name ?? "Player")}
            </span>
          </li>
        ))}
      </ul>

      {cross && (
        <p className="type-small text-muted-foreground">Check in together for the cross-school bonus.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {children}
        <Button variant="outline" onClick={() => copyInvite(squad.code)}>
          <Copy aria-hidden />
          Copy invite link
        </Button>
        <span className="type-small text-muted-foreground tabular-nums">
          Code <span className="font-semibold text-foreground">{squad.code}</span>
        </span>
        {onLeave && (
          <Button variant="ghost" onClick={onLeave} className="ml-auto">
            <LogOut aria-hidden />
            Leave
          </Button>
        )}
      </div>
    </article>
  );
}
