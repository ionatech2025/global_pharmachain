# Runbook: switching on WhatsApp notifications (US-604)

WhatsApp is **off** until this is done. While it is off, the account page says
WhatsApp is not available, the notification preferences show email only, and
nothing is queued. `GET /api/backend/health/ready` reports `"whatsapp": "off"`.

## Why templates

Meta's WhatsApp Cloud API lets a business **start** a conversation only with a
message template approved in WhatsApp Manager. Free-form text is accepted only
inside the 24-hour window after the user messages the business. A notification
platform never has that window, so everything goes out as a template.

## The public chat number is a different thing

The site's **WhatsApp** contact link, *Message Pharmachain Global Enterprises on
WhatsApp*, points to <https://wa.me/256784528651>. It is set with
`NEXT_PUBLIC_WHATSAPP_NUMBER` (default `+256 784 528651`; build-time, so release
after changing it). It only opens a chat with the company's WhatsApp Business
app. It does not send any platform notifications.

Platform notifications need the Cloud API setup below. To send them from the
same number, that number must also be onboarded to the Cloud API in WhatsApp
Manager. Check Meta's current terms for numbers that are already in use in the
WhatsApp Business app. Either way, `WHATSAPP_PHONE_ID` is the **Phone number
ID** that Meta assigns, never the number itself.

## 1. Meta side (the business owner)

1. A Meta Business account (business verification raises the sending limits).
2. A Meta app with the **WhatsApp** product, and a **WhatsApp Business phone
   number** registered to it. Note its **Phone number ID**, not the number itself.
3. A **System user** with a **permanent access token** that has the
   `whatsapp_business_messaging` permission. Temporary tokens expire in 24 hours.
4. Two templates in WhatsApp Manager, both in the same language (e.g. `en`):

   | Purpose | Category | Content |
   | --- | --- | --- |
   | Number verification | **Authentication** | Meta's fixed OTP text, with a **Copy code** button |
   | Notifications | **Utility** | Body such as `Global PharmaChain update: {{1}}` — one parameter, which carries the summary and link |

   Wait until both show **Approved**.

## 2. Platform side (Vercel → Production environment variables)

| Variable | Value |
| --- | --- |
| `WHATSAPP_PROVIDER` | `meta` |
| `WHATSAPP_TOKEN` | the permanent token (Sensitive) |
| `WHATSAPP_PHONE_ID` | the Phone number ID |
| `WHATSAPP_TEMPLATE_VERIFY` | name of the Authentication template |
| `WHATSAPP_TEMPLATE_NOTIFY` | name of the Utility template |
| `WHATSAPP_TEMPLATE_LANGUAGE` | optional, default `en` — must match the templates |
| `WHATSAPP_GRAPH_VERSION` | optional, default `v26.0` |

All four required values must be present. With any one missing, the channel stays
off, and the API logs `[whatsapp] channel off: … unset` once per instance.

Environment variables bind when a deployment is created, so **release again**
after setting them.

## 3. Check it

1. `curl https://www.pharmachainglobal.com/api/backend/health/ready` → `"whatsapp":"meta"`.
2. Account → WhatsApp notifications → save your own number → the code arrives on
   WhatsApp → enter it → *Verified number*.
3. Notifications → the WhatsApp switches are now enabled.
4. Trigger an event (e.g. a quotation on your RFQ) and check the message.

If the code does not arrive, the API answers 502 *"We couldn't send a code…"* and
logs `[whatsapp-verify] challenge delivery failed:` with Meta's error. Common
codes:

- **131026:** the number is not on WhatsApp.
- **132001:** the template name or language does not exist.
- **132018:** the parameter text is invalid.
- **190:** the token is invalid or expired.

Notification sends that fail stay in `NotificationOutbox`, with the error in
`lastError`, and are retried by the outbox job.

## Switching it off again

Remove `WHATSAPP_PROVIDER`, or set it to an empty value, and release. Users'
saved numbers are kept, and nothing is sent.
