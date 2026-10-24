import type { Metadata } from "next";
import { CheckIn } from "@/components/customer/CheckIn";

export const metadata: Metadata = { title: "Check in" };

export default function Page() {
  return <CheckIn />;
}
