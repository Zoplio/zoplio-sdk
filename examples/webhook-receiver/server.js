'use strict';

/**
 * Minimal Zoplio webhook receiver.
 *
 * Zoplio delivers POST {id, event, payload, timestamp} with headers:
 *   X-Zoplio-Event:       event name (e.g. meeting.confirmed)
 *   X-Zoplio-Signature:   lowercase-hex HMAC-SHA256 of the RAW request body,
 *                         keyed with your subscription's whsec_ secret
 *                         (returned once by POST /v1/webhooks).
 *   X-Zoplio-Delivery-Id: stable event id (= body id), the same on every retry.
 *
 * Delivery is at-least-once, so the receiver skips ids it has already seen.
 *
 * Run: ZOPLIO_WEBHOOK_SECRET=whsec_... node server.js
 */

const crypto = require('node:crypto');
const express = require('express');

const SECRET = process.env.ZOPLIO_WEBHOOK_SECRET;
if (!SECRET) {
  console.error('Set ZOPLIO_WEBHOOK_SECRET (the whsec_ value from POST /v1/webhooks)');
  process.exit(1);
}

const app = express();

// Ids of events already handled. In production keep these in your database
// (with a TTL of a few days); a retry of the same event reuses the id.
const seen = new Set();

// IMPORTANT: verify against the RAW body; re-serialized JSON may not match.
app.post('/zoplio-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.get('x-zoplio-signature') ?? '';
  const expected = crypto.createHmac('sha256', SECRET).update(req.body).digest('hex');

  const valid =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

  if (!valid) {
    console.warn('invalid signature, dropping delivery');
    return res.status(401).end();
  }

  const { id, event, payload, timestamp } = JSON.parse(req.body.toString('utf8'));
  if (id && seen.has(id)) {
    // A retry of an event we already processed: acknowledge, do nothing.
    return res.status(204).end();
  }
  if (id) seen.add(id);
  console.log(`[${timestamp}] ${event} ${id ?? ''}`, payload);

  switch (event) {
    case 'meeting.confirmed':
      // payload: { meetingId, organizerUserId, billingAccountId, negotiationId, participantEmails, confirmedSlot, title }
      // billingAccountId is the account that owns the API key; it equals
      // organizerUserId unless the meeting was arranged on behalf of someone else
      break;
    case 'meeting.rescheduled':
      // payload: { meetingId, organizerUserId, billingAccountId, title, previousSlot }; a fresh
      // meeting.confirmed (or a cancellation) follows when the move resolves
      break;
    case 'meeting.cancelled':
    case 'negotiation.failed':
    case 'meeting.created':
      break;
    default:
      console.log('unhandled event', event);
  }

  // Respond 2xx fast: Zoplio retries non-2xx deliveries (1m, 5m) and
  // disables the subscription after 10 consecutive failures.
  res.status(204).end();
});

app.listen(process.env.PORT ?? 8787, () => {
  console.log('listening on', process.env.PORT ?? 8787);
});
