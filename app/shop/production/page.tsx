import type { Metadata } from "next";
import { Production } from "@/components/shop/Production";

export const metadata: Metadata = { title: "Production" };

export default function Page() {
  return <Production />;
}
