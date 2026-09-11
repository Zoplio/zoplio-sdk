# Webhook receiver example

Receives Zoplio webhook deliveries and verifies the `X-Zoplio-Signature` HMAC against the raw body.

```bash
npm install
ZOPLIO_WEBHOOK_SECRET=whsec_your_secret npm start
# register it:
curl -X POST https://api.zoplio.com/v1/webhooks \
  -H "Authorization: Bearer zpl_YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://your-public-url/zoplio-webhook","events":["meeting.confirmed","meeting.rescheduled","meeting.cancelled"]}'
```

The URL you register must be a public https URL: the host is DNS-resolved and validated at subscribe time, so `https://your-public-url/...` is rejected until it points at a live public host (for local development, a tunnel to your machine works).

Notes: verify against the **raw** request body (don't re-serialize JSON); respond 2xx quickly: failed deliveries retry after 1 m and 5 m, and a subscription auto-disables after 10 consecutive failures. The JS SDK ships the same check as `ZoplioClient.verifyWebhookSignature(rawBody, signatureHeader, secret)`.
