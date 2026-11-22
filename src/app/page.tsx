// Home = the live 3D map of the T, with this week's featured quest floating over it.
import MapClient from "@/components/map/MapClient";
import { ExploreQuestOfTheWeek } from "@/features/weekly/quest-of-the-week";

export default function Home() {
  return (
    <>
      <MapClient />
      <ExploreQuestOfTheWeek />
    </>
  );
}
