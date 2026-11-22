// Missing quest (DESIGN.md §9 Not found): maroon header, one line, one way back.
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/shell/page-header";

export default function QuestNotFound() {
  return (
    <>
      <PageHeader title="Quest not found" />
      <div className="mx-auto flex max-w-[720px] flex-col items-center gap-4 px-4 py-16 text-center">
        <p className="type-body max-w-md text-muted-foreground">
          The link may be old, or the quest was taken down. Pick a station on the map to find another.
        </p>
        <Button asChild>
          <Link href="/">Open the map</Link>
        </Button>
      </div>
    </>
  );
}
