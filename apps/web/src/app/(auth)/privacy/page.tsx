import { Card, CardContent, CardHeader, CardTitle } from "@pharmachain/ui/components/card";

export const metadata = { title: "Privacy policy" };

// GDPR-aligned policy summary (US-1003). Replace with counsel-reviewed text
// before public launch.
export default function PrivacyPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-lg font-semibold leading-none">Privacy policy</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          Global PharmaChain processes company and user data solely to operate this B2B sourcing
          platform: registration and verification, catalogue listings, RFQs and quotations, orders
          and shipment visibility, documents, and messaging between trading parties.
        </p>
        <p>
          <strong className="text-foreground">What we store.</strong> Account details (name, work
          email, optional WhatsApp number), company registration data and compliance documents,
          transactional records, and an immutable audit trail required for regulatory traceability.
          Data is encrypted in transit; production storage is encrypted at rest.
        </p>
        <p>
          <strong className="text-foreground">Your rights.</strong> From Account settings you can
          export your personal data at any time and request account deletion. We confirm the request
          by email and complete it within one month: your name, email address, phone number, sign-in
          details, devices, notifications and settings are erased and the account is closed. Records
          the law requires us to keep — orders, RFQs, documents, payments and order messages (at
          least five years under EU Good Distribution Practice) and the audit log — are kept, shown
          as “Deleted User”. You may also complain to your data protection supervisory authority.
        </p>
        <p>
          <strong className="text-foreground">Notifications.</strong> Email and WhatsApp
          notifications are per-event opt-out in Settings; in-app notifications are always
          delivered. Data is owned by the uploading company and is never sold.
        </p>
      </CardContent>
    </Card>
  );
}
