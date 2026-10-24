import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomerFile } from "@/components/shop/CustomerFile";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Customer file" };

export default function Page({ params }: PageProps<"/shop/customers/[fileNo]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/shop/customers/[fileNo]">["params"] }) {
  const { fileNo } = await params;
  return <CustomerFile fileNo={decodeURIComponent(fileNo)} />;
}
