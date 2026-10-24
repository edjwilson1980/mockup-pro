import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderBuilder } from "@/components/customer/OrderBuilder";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Your order" };

export default function Page({ params }: PageProps<"/order/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/order/[id]">["params"] }) {
  const { id } = await params;
  return <OrderBuilder id={id} />;
}
