import { Card, CardContent, CardHeader, CardTitle } from "@pharmachain/ui/components/card";

export const metadata = { title: "Privacy policy" };

// GDPR-aligned policy summary (US-1003). Replace with counsel-reviewed text
// before public launch.
export default function PrivacyPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy policy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          PharmaChain processes company and user data solely to operate this B2B sourcing platform:
          registration and verification, catalogue listings, RFQs and quotations, orders and
          shipment visibility, documents, and messaging between trading parties.
        </p>
        <p>
          <strong className="text-foreground">What we store.</strong> Account details (name, work
          email, optional WhatsApp number), company registration data and compliance documents,
          transactional records, and an immutable audit trail required for regulatory traceability.
          Data is encrypted in transit; production storage is encrypted at rest.
        </p>
        <p>
          <strong className="text-foreground">Your rights.</strong> From Account settings you can
          export your personal data at any time and request account deletion. Deletion requests are
          actioned within 30 days by anonymising personal data; business and audit records that must
          legally be retained survive attributed to “Deleted User”.
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
