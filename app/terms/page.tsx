import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/customer/Legal";
import { BRAND } from "@/lib/consent";

export const metadata: Metadata = { title: "Terms" };

export default function Page() {
  return (
    <LegalPage title="Terms">
      <h2>Text message program</h2>
      <ul>
        <li>
          <strong>Program:</strong> {BRAND} order updates and promotions.
        </li>
        <li>
          <strong>Order updates</strong> (if you opt in): mockup ready, proof ready, approval, and pickup texts about your order.
        </li>
        <li>
          <strong>Promotions</strong> (separate opt-in): deals, new products and shop news, by text and email.
        </li>
        <li>Message frequency varies. Message and data rates may apply.</li>
        <li>
          Reply <strong>STOP</strong> to cancel at any time; we&apos;ll send one text confirming you&apos;re unsubscribed. Reply <strong>HELP</strong> for help.
        </li>
        <li>Consent to texts is not a condition of purchase.</li>
        <li>Carriers are not liable for delayed or undelivered messages.</li>
        <li>
          See our{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>{" "}
          for how we handle your information.
        </li>
      </ul>
      <h2>Orders and artwork</h2>
      <ul>
        <li>We print what you approve on the proof. Check spelling, sizes and colors before approving.</li>
        <li>You confirm you own or have permission to use any artwork you upload.</li>
        <li>Colors on screen can differ slightly from the printed shirt.</li>
      </ul>
    </LegalPage>
  );
}
