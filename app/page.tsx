import { redirect } from "next/navigation";

/** The main link is the customer side. The shop side is /shop (password). */
export default function Home() {
  redirect("/start");
}
