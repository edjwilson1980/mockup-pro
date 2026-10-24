import type { Metadata } from "next";
import { Suspense } from "react";
import { ShopLogin } from "@/components/shop/ShopLogin";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Shop sign in", robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ShopLogin />
    </Suspense>
  );
}
