"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Card, CustomerShell, H1, H2, Loading, Notice } from "@/components/ui";
import { ACCEPTED_UPLOADS, readUpload, type ReadUpload } from "@/lib/art";
import { saveAsset, updateDesign } from "@/lib/demo/actions";
import { useDemo } from "@/lib/demo/store";
import { spotDef } from "@/lib/catalog";
import { Missing } from "./OrderBuilder";

/**
 * Spec 2.4: upload artwork. In the demo the art engine isn't connected, so the
 * file is checked here and kept as sent; the shop sees what still needs work.
 */
export function UploadArt({ id }: { id: string }) {
  const demo = useDemo();
  const router = useRouter();
  const params = useSearchParams();
  const designId = params.get("design");
  const spotId = params.get("spot");
  const [file, setFile] = useState<{ name: string; read: ReadUpload } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!demo) return <Loading />;
  const order = demo.orders.find((o) => o.id === id);
  if (!order) return <Missing />;
  const back = designId ? `/order/${id}/item/${designId}` : `/order/${id}`;
  const editingSpot = order.designs.find((d) => d.id === designId)?.spots.find((s) => s.id === spotId);
  const spotLabel = editingSpot ? spotDef(editingSpot.spotId).label : null;

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    setFile(null);
    setBusy(true);
    try {
      setFile({ name: f.name.replace(/\.[a-z0-9]+$/i, ""), read: await readUpload(f) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file couldn't be used.");
    } finally {
      setBusy(false);
    }
  }

  const saved = demo.assets.filter((a) => a.customerId === order.customerId).reverse();

  function use() {
    if (!file || !order) return;
    place(saveAsset(order.customerId, { name: file.name, src: file.read.dataUrl, widthPx: file.read.widthPx, heightPx: file.read.heightPx, checks: file.read.checks }));
  }

  /** Puts the art on the shirt: the spot being edited, or design 1's full front on a new order. */
  function place(assetId: string) {
    if (!order) return;
    if (designId && spotId) {
      const design = order.designs.find((d) => d.id === designId);
      const firstArt = !!design && !design.spots.some((s) => s.assetId);
      updateDesign(order.id, designId, (d) => {
        const s = d.spots.find((x) => x.id === spotId);
        if (s) s.assetId = assetId;
      });
      // The first artwork on a shirt: the color comes next.
      router.push(firstArt ? `${back}?pick=color` : back);
      return;
    }
    // Saved to the customer's artwork; they place it from the shirt page.
    router.push(designId ? back : `/order/${order.id}`);
  }

  return (
    <CustomerShell step="Step 2 of 4" back={{ href: back, label: designId ? "Back to the shirt" : "Your order" }}>
      <H1 kicker={`Order ${order.orderNo}`}>{spotLabel ? `Artwork for the ${spotLabel.toLowerCase()}` : saved.length ? "Choose your artwork" : "Upload your artwork"}</H1>
      {saved.length > 0 && !file && (
        <Card>
          <H2 className="mb-1">Your saved artwork</H2>
          <p className="text-muted text-[14px] mb-3">Tap one to use it again.</p>
          <ul className="grid grid-cols-3 gap-3">
            {saved.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => place(a.id)} className="w-full flex flex-col gap-1.5 text-left rounded-[12px] p-1 border-2 border-transparent hover:border-blue focus-visible:border-blue">
                  <span className="aspect-square w-full rounded-[10px] checker p-2 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local art */}
                    <img src={a.src} alt="" className="max-h-full max-w-full object-contain" />
                  </span>
                  <span className="text-[13px] font-medium truncate">{a.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {saved.length > 0 && !file && <H2>Or upload new artwork</H2>}
      <p className="text-ink-2">PNG, JPG or SVG. A logo with a transparent background prints best.</p>
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void pick(e.dataTransfer.files[0]);
        }}
        className="flex flex-col items-center justify-center gap-2 min-h-40 rounded-[14px] border-2 border-dashed border-line-strong bg-white text-center px-4 cursor-pointer hover:border-blue"
      >
        <span className="font-cond font-bold text-[22px] uppercase text-blue">{busy ? "Checking…" : "Choose a file"}</span>
        <span className="text-muted text-[14px]">or drop it here</span>
        <input type="file" accept={ACCEPTED_UPLOADS} className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
      {error && <Notice tone="bad">{error}</Notice>}

      {file && (
        <Card className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <figure className="flex flex-col gap-1.5">
              <div className="aspect-square rounded-[10px] checker p-3 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- local upload */}
                <img src={file.read.dataUrl} alt="What you sent" className="max-h-full max-w-full object-contain" />
              </div>
              <figcaption className="text-[13px] font-semibold text-muted">What you sent</figcaption>
            </figure>
            <figure className="flex flex-col gap-1.5">
              <div className="aspect-square rounded-[10px] checker p-3 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- local upload */}
                <img src={file.read.dataUrl} alt="Print ready" className="max-h-full max-w-full object-contain" />
              </div>
              <figcaption className="text-[13px] font-semibold text-muted">Print ready</figcaption>
            </figure>
          </div>
          <div className="text-[13px] text-muted">
            {file.read.widthPx} × {file.read.heightPx} px
          </div>
          <ul className="flex flex-col gap-1.5">
            {file.read.checks.map((c) => (
              <li key={c.text} className={`flex gap-2 text-[15px] ${c.ok ? "text-good" : "text-warn"}`}>
                <span aria-hidden="true">{c.ok ? "✓" : "⚠"}</span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
          <Notice tone="info">Demo: the art engine (background removal, sharpening, DTF clean-up) isn&apos;t connected yet, so the art is used as sent.</Notice>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-[15px]">Name this artwork</span>
            <input className="min-h-12 px-3 rounded-[10px] border border-line-strong bg-white" value={file.name} onChange={(e) => setFile({ ...file, name: e.target.value })} />
          </label>
          <Button size="lg" onClick={use} disabled={!file.name.trim()}>
            Use this artwork
          </Button>
        </Card>
      )}
    </CustomerShell>
  );
}
