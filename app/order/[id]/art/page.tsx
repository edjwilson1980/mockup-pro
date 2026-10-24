import type { Metadata } from "next";
import { Suspense } from "react";
import { UploadArt } from "@/components/customer/UploadArt";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Upload artwork" };

export default function Page({ params }: PageProps<"/order/[id]/art">) {
  return (
    <Suspense fallback={<Loading />}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/order/[id]/art">["params"] }) {
  const { id } = await params;
  return <UploadArt id={id} />;
}
