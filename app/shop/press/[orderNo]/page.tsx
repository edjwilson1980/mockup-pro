import type { Metadata } from "next";
import { Suspense } from "react";
import { Press } from "@/components/shop/Press";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Press station" };

export default function Page({ params }: PageProps<"/shop/press/[orderNo]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/shop/press/[orderNo]">["params"] }) {
  const { orderNo } = await params;
  return <Press orderNo={decodeURIComponent(orderNo)} />;
}
