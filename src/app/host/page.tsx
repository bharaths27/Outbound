// Hosting moved into Events: the + Host button there opens the form.
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/events?host=1");
}
