import type { Metadata } from "next";
import { Studio } from "@/components/shop/Studio";

export const metadata: Metadata = { title: "Mockup studio" };

export default function Page() {
  return <Studio />;
}
