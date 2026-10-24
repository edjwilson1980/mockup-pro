import type { Metadata } from "next";
import { Suspense } from "react";
import { PrintSpots } from "@/components/customer/PrintSpots";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Print spots" };

export default function Page({ params }: PageProps<"/order/[id]/item/[itemId]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/order/[id]/item/[itemId]">["params"] }) {
  const { id, itemId } = await params;
  return <PrintSpots id={id} itemId={itemId} />;
}
