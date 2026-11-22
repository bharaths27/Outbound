"use client";

// Who can see my visits (profiles.privacy). Used in onboarding and privacy settings.
// Ghost mode is the "Only me" choice. School XP counts either way.

import { useId } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Privacy } from "@/lib/data/types";

export const PRIVACY_OPTIONS: { value: Privacy; label: string; body: string }[] = [
  { value: "public", label: "Everyone on Outbound", body: "Any player can see your stamps and when you got them." },
  { value: "friends", label: "Friends only", body: "Only people you've added as friends see your visits." },
  {
    value: "ghost",
    label: "Only me (ghost mode)",
    body: "Nobody sees your visits. Your XP still counts for your school.",
  },
];

export function privacyLabel(p: Privacy): string {
  return PRIVACY_OPTIONS.find((o) => o.value === p)!.label;
}

export function PrivacyChoice({
  value,
  onChange,
  disabled,
}: {
  value: Privacy;
  onChange: (p: Privacy) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="type-heading mb-1">Who can see your visits</legend>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as Privacy)} className="gap-2">
        {PRIVACY_OPTIONS.map((o) => (
          <label
            key={o.value}
            htmlFor={`${id}-${o.value}`}
            className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 has-data-checked:border-primary has-data-checked:bg-muted/60"
          >
            <RadioGroupItem id={`${id}-${o.value}`} value={o.value} className="mt-1" />
            <span className="flex flex-col gap-0.5">
              <span className="type-body font-medium">{o.label}</span>
              <span className="type-small text-muted-foreground">{o.body}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
      <p className="type-small text-muted-foreground">
        Your live location is never shared. Outbound checks it only when you check in.
      </p>
    </fieldset>
  );
}
