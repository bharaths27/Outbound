// Home = the live map. Owner: Verna. Placeholder until the map component lands.
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen p-8 flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Outbound</h1>
      <p>Live T map goes here.</p>
      <nav className="flex gap-4 underline">
        <Link href="/login">Login</Link>
        <Link href="/passport">Passport</Link>
        <Link href="/leaderboard">Leaderboard</Link>
        <Link href="/api/trains">/api/trains</Link>
        <Link href="/api/lateness">/api/lateness</Link>
      </nav>
    </main>
  );
}
