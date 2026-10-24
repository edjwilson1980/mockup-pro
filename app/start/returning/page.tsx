import type { Metadata } from "next";
import { Returning } from "@/components/customer/Returning";

export const metadata: Metadata = { title: "Returning customer" };

export default function Page() {
  return <Returning />;
}
