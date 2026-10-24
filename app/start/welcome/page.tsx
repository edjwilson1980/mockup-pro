import type { Metadata } from "next";
import { Suspense } from "react";
import { Welcome } from "@/components/customer/Welcome";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Welcome back" };

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Welcome />
    </Suspense>
  );
}
