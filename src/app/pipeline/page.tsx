// Pipeline: how Outbound works, for the demo (src/features/pipeline).
import type { Metadata } from "next";
import { PipelinePage } from "@/features/pipeline/pipeline-page";

export const metadata: Metadata = { title: "How it works" };

export default function Page() {
  return <PipelinePage />;
}
