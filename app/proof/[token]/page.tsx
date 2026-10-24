import type { Metadata } from "next";
import { Suspense } from "react";
import { Proof } from "@/components/customer/Proof";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Your proof", robots: { index: false } };

export default function Page({ params }: PageProps<"/proof/[token]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/proof/[token]">["params"] }) {
  const { token } = await params;
  return <Proof token={token} />;
}
