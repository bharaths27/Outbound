import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function QuestNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
      <h1 className="type-title">We couldn&apos;t find that quest</h1>
      <p className="type-body text-muted-foreground">
        The link may be old, or the quest was taken down. Pick a station on the map to find another.
      </p>
      <Button asChild>
        <Link href="/">Open the map</Link>
      </Button>
    </div>
  );
}
