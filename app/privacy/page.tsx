import type { Metadata } from "next";
import { LegalPage } from "@/components/customer/Legal";
import { BRAND } from "@/lib/consent";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function Page() {
  return (
    <LegalPage title="Privacy Policy">
      <p>This policy explains what {BRAND} collects when you order from us, and how we use it.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Your name, mobile number and email.</li>
        <li>Artwork you upload, your orders, and your proof approvals.</li>
        <li>Your text and email choices, with the date you made them.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To make your order: mockups, proofs, printing and pickup.</li>
        <li>To send order updates by text, only if you opted in.</li>
        <li>To send promotions by text or email, only if you opted in to promotions.</li>
        <li>To email your proof and order receipts.</li>
      </ul>
      <h2>Text messages</h2>
      <p>
        No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Text messaging opt-in data and consent are not shared with any third parties. We share your number only with the
        service providers that deliver our messages, and only to deliver them.
      </p>
      <h2>Sharing</h2>
      <p>We don&apos;t sell your personal information. We use service providers (hosting, database, text and email delivery) that handle data only on our behalf.</p>
      <h2>Your choices</h2>
      <ul>
        <li>Reply STOP to any text to stop texts. Reply HELP for help.</li>
        <li>Use the unsubscribe link in any promotional email.</li>
        <li>Ask us at the shop to see, correct or delete your information.</li>
      </ul>
      <h2>Keeping it safe</h2>
      <p>Your file is stored with access limited to shop staff. We keep your artwork so you can reorder; ask us any time to delete it.</p>
    </LegalPage>
  );
}
