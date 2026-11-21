// /dev/theme: every token, type style, control, and a sample stamp, so the team can check
// the look in light and dark. Owner: Angie. Not linked from the app.

import { Clock, Footprints, Search, Utensils, X } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Stamp } from "@/features/passport/stamp";
import { ThemeToggle } from "@/features/shell/theme-toggle";
import { data } from "@/lib/data";
import { LINE_COLORS } from "@/lib/lines";

export const metadata = { title: "Theme" };

const SWATCHES: { name: string; className: string; text?: string }[] = [
  { name: "background", className: "bg-background" },
  { name: "foreground", className: "bg-foreground" },
  { name: "card", className: "bg-card" },
  { name: "primary", className: "bg-primary", text: "text-primary-foreground" },
  { name: "secondary", className: "bg-secondary", text: "text-secondary-foreground" },
  { name: "muted", className: "bg-muted", text: "text-muted-foreground" },
  { name: "accent", className: "bg-accent", text: "text-accent-foreground" },
  { name: "destructive", className: "bg-destructive" },
  { name: "border", className: "bg-border" },
  { name: "ring", className: "bg-ring" },
  { name: "gold", className: "bg-gold", text: "text-gold-foreground" },
  { name: "tier-bronze", className: "bg-tier-bronze" },
  { name: "tier-silver", className: "bg-tier-silver" },
  { name: "tier-gold", className: "bg-tier-gold" },
  { name: "xp", className: "bg-xp" },
  { name: "overlay", className: "bg-overlay" },
];

const TYPE_STYLES = [
  { name: "Display 32/36 800 w125", className: "type-display", sample: "Kenmore" },
  { name: "Title 22/28 700 w112", className: "type-title", sample: "Your passport" },
  { name: "Heading 17/24 600", className: "type-heading", sample: "Spicy noodle bowl near Kenmore" },
  { name: "Body 15/22 400", className: "type-body", sample: "The Citgo sign has watched over Kenmore Square since 1965." },
  { name: "Small 13/18 500", className: "type-small", sample: "$8 bowl · 6 min walk · Open until 10 pm" },
  { name: "Tiny 11/14 600", className: "type-tiny", sample: "Sample" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t pt-6">
      <h2 className="type-heading">{title}</h2>
      {children}
    </section>
  );
}

export default async function ThemePage() {
  const schools = (await data.getSchools()).slice(0, 4);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-6 pb-16 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="type-title">Outbound theme</h1>
          <p className="text-muted-foreground">Tokens and components from DESIGN.md.</p>
        </div>
        <ThemeToggle />
      </header>

      <Section title="Color tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SWATCHES.map((s) => (
            <div key={s.name} className="flex flex-col gap-1.5">
              <div className={`flex h-14 items-end rounded-lg border p-2 ${s.className}`}>
                {s.text && <span className={`type-tiny ${s.text}`}>Aa</span>}
              </div>
              <span className="type-small">{s.name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-4">
          {TYPE_STYLES.map((t) => (
            <div key={t.name} className="flex flex-col gap-1">
              <span className="type-small text-muted-foreground">{t.name}</span>
              <span className={t.className}>{t.sample}</span>
            </div>
          ))}
          <p className="type-heading tabular-nums">
            Tabular figures: <span className="text-xp">+1,240 XP</span> · rank 3 · 04:59
          </p>
        </div>
      </Section>

      <Section title="Stamps">
        <div className="flex flex-wrap items-center gap-6">
          <Stamp questId="chncl-bakery-food" title="Bakery run in Chinatown" neighborhood="Chinatown" type="food" tier="bronze" />
          <Stamp questId="harsq-books-event" title="Browse a Harvard Square bookstore" neighborhood="Harvard Square" type="event" tier="silver" />
          <Stamp questId="kenmore-citgo-scenic" title="See the Citgo sign light up" neighborhood="Fenway-Kenmore" type="scenic" tier="gold" />
          <Stamp questId="kenmore-gardner-scenic" title="See the Gardner Museum courtyard" neighborhood="Fenway-Kenmore" type="scenic" tier="gold" crossSchool />
          <Stamp questId="coecl-brunch-food" title="Brunch on Newbury Street" neighborhood="Back Bay" tier="bronze" locked />
        </div>
        <p className="type-small text-muted-foreground">Bronze, silver, gold, gold cross-school, locked.</p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button variant="gold">Check in</Button>
          <Button>Join tournament</Button>
          <Button variant="secondary">Create squad</Button>
          <Button variant="outline">Copy invite link</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="destructive">Leave squad</Button>
          <Button variant="link">Read more</Button>
          <Button disabled>Disabled</Button>
          <Button variant="outline" size="icon" aria-label="Search">
            <Search />
          </Button>
        </div>
      </Section>

      <Section title="Filters">
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="h-11 pl-10" placeholder="Cheap spicy noodles, 30 min" aria-label="Search quests" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="h-7 px-3">
              spicy <X aria-hidden />
            </Badge>
            <Badge variant="secondary" className="h-7 px-3">
              Under $10 <X aria-hidden />
            </Badge>
          </div>
          <ToggleGroup type="multiple" variant="chip" defaultValue={["spicy"]} aria-label="Cravings" className="flex-wrap">
            {["spicy", "noodles", "coffee", "late-night", "sweet"].map((c) => (
              <ToggleGroupItem key={c} value={c}>{c}</ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup type="single" variant="chip" defaultValue="1" aria-label="Budget">
            {["Free", "Under $10", "$10–20", "$20+"].map((b, i) => (
              <ToggleGroupItem key={b} value={String(i)}>{b}</ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <label className="flex items-center gap-3">
              <Switch defaultChecked /> Open now
            </label>
            <span className="type-small text-muted-foreground tabular-nums">8 quests</span>
          </div>
        </div>
      </Section>

      <Section title="Quest card">
        <Card className="max-w-sm gap-3 p-3">
          <Skeleton className="aspect-[4/3] w-full rounded-md" />
          <CardContent className="flex flex-col gap-2 px-1">
            <h3 className="type-heading">Spicy noodle bowl near Kenmore</h3>
            <p className="type-small flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
              <span className="flex items-center gap-1"><Utensils className="size-4" aria-hidden /> $8 bowl</span>
              <span className="flex items-center gap-1"><Footprints className="size-4" aria-hidden /> 6 min</span>
              <span className="flex items-center gap-1"><Clock className="size-4" aria-hidden /> Open</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">spicy</Badge>
              <Badge variant="outline">noodles</Badge>
              <Badge className="bg-gold text-gold-foreground">Sample deal</Badge>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="type-heading text-xp tabular-nums">+50 XP</span>
              <Button variant="gold">Check in</Button>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Progress, tabs, avatars">
        <div className="flex max-w-sm flex-col gap-2">
          <div className="flex justify-between type-small">
            <span>Chinatown · Silver</span>
            <span className="tabular-nums text-muted-foreground">3 of 5 for Gold</span>
          </div>
          <Progress value={60} aria-label="Progress to Gold" />
        </div>
        <Tabs defaultValue="schools" className="max-w-sm">
          <TabsList className="w-full">
            <TabsTrigger value="schools">Schools</TabsTrigger>
            <TabsTrigger value="squads">Squads</TabsTrigger>
          </TabsList>
          <TabsContent value="schools" className="pt-2 text-muted-foreground">Weekly school standings.</TabsContent>
          <TabsContent value="squads" className="pt-2 text-muted-foreground">Your squads.</TabsContent>
        </Tabs>
        <div className="flex items-center gap-3">
          {schools.map((s) => (
            <Avatar key={s.id} size="lg" className="ring-2 ring-offset-2 ring-offset-background" style={{ "--tw-ring-color": s.color ?? undefined } as React.CSSProperties}>
              <AvatarFallback>{s.name.slice(0, 2)}</AvatarFallback>
            </Avatar>
          ))}
          <span className="type-small text-muted-foreground">School-color rings</span>
        </div>
      </Section>

      <Section title="Privacy and line badges">
        <RadioGroup defaultValue="friends" aria-label="Who can see your visits" className="max-w-sm">
          {[
            ["public", "Everyone"],
            ["friends", "Friends"],
            ["ghost", "Only me (ghost mode)"],
          ].map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-3">
              <RadioGroupItem value={value} /> {label}
            </label>
          ))}
        </RadioGroup>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LINE_COLORS) as (keyof typeof LINE_COLORS)[]).map((line) => (
            <Badge key={line} variant="outline" className="h-6 gap-1.5 px-2.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: LINE_COLORS[line] }} aria-hidden />
              {line}
            </Badge>
          ))}
        </div>
      </Section>
    </div>
  );
}
