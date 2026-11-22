// Home = the live 3D map of the T, under the "Explore Boston" card, with this week's
// featured quest floating over it (src/features/explore).
import MapClient from "@/components/map/MapClient";
import { ExploreLayout } from "@/features/explore/explore-layout";
import { ExploreQuestOfTheWeek } from "@/features/weekly/quest-of-the-week";

export default function Home() {
  return (
    <ExploreLayout>
      <MapClient />
      <ExploreQuestOfTheWeek />
    </ExploreLayout>
  );
}
