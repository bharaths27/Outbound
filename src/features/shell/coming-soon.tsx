// Placeholder page for tabs that aren't built yet: title band, one sentence, one action.

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "./page-header";

export function ComingSoon({ title, body }: { title: string; body: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="mx-auto flex max-w-[720px] flex-col items-center gap-4 px-4 py-16 text-center">
        <p className="type-body max-w-md text-muted-foreground">{body}</p>
        <Button asChild>
          <Link href="/">Open the map</Link>
        </Button>
      </div>
    </>
  );
}
