import type { Metadata } from "next";
import { Suspense } from "react";
import { Names } from "@/components/customer/Names";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Names & numbers" };

export default function Page({ params }: PageProps<"/order/[id]/item/[itemId]/names">) {
  return (
    <Suspense fallback={<Loading />}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/order/[id]/item/[itemId]/names">["params"] }) {
  const { id, itemId } = await params;
  return <Names id={id} itemId={itemId} />;
}
