// Not found (DESIGN.md §9): maroon header, one line, and one way back. Covers missing
// quests (/q/<id> calls notFound()) and any unknown route.
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/shell/page-header";

export default function NotFound() {
  return (
    <>
      <PageHeader title="Nothing here" />
      <div className="mx-auto flex max-w-[720px] flex-col items-center gap-4 px-4 py-16 text-center">
        <p className="type-body max-w-md text-muted-foreground">
          That page doesn’t exist. Pick a station on the map to find something nearby.
        </p>
        <Button asChild>
          <Link href="/">Open the map</Link>
        </Button>
      </div>
    </>
  );
}
