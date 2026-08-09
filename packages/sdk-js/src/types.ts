/**
 * Wire types for the Zoplio public API v1 (served by api-gateway under /v1).
 * Shapes mirror apps/api-gateway/src — these are the exact JSON bodies on the
 * wire, not internal models.
 */

export interface ZoplioConfig {
  /** API key, format `zpl_<hex>`. Sent as `Authorization: Bearer zpl_...`. */
  apiKey: string;
  /** API origin. Defaults to `https://api.zoplio.com`. */
  baseUrl?: string;
}

/** Error codes used by every non-2xx response. */
export type ApiErrorCode =
  | 'unauthorized'
  | 'rate_limited'
  | 'validation_failed'
  | 'not_found'
  | 'conflict'
  | 'quota_exceeded'
  | 'upstream_error';

/** Per-field validation detail attached to `validation_failed` errors. */
export interface FieldDetail {
  field: string;
  message: string;
}

export type MeetingStatus =
  | 'draft'
  | 'negotiating'
  | 'confirmed'
  | 'cancelled'
  | 'rescheduling';

/** Public webhook event names — the only events delivered to subscribers. */
export type WebhookEvent =
  | 'meeting.created'
  | 'meeting.confirmed'
  | 'meeting.cancelled'
  | 'negotiation.failed';

/** A concrete time slot. ISO 8601 datetimes (UTC). */
export interface Slot {
  start: string;
  end: string;
}

/** Meeting participant input — each entry needs `phone` (E.164) or `email`. */
export interface ParticipantInput {
  /** E.164 phone number, e.g. `+420777123456`. */
  phone?: string;
  email?: string;
  /** Display name, max 200 chars. */
  name?: string;
}

export interface ScheduleMeetingParams {
  /** Max 300 chars. Defaults to "Meeting" server-side. */
  title?: string;
  /** Integer 5..1440. Defaults to 30 server-side. */
  durationMinutes?: number;
  /** 1..8 participants, each with a phone or an email. */
  participants: ParticipantInput[];
  /** YYYY-MM-DD. Required when `preferredTime` is set. */
  preferredDate?: string;
  /** HH:MM (24h). */
  preferredTime?: string;
  /** IANA timezone the preferredDate/preferredTime are expressed in. */
  timezone?: string;
  /** YYYY-MM-DD. */
  earliestDate?: string;
  /** YYYY-MM-DD. */
  latestDate?: string;
  /** Ask participants for their availability instead of proposing slots. */
  openAsk?: boolean;
  /** Max 500 chars. Omitting it makes the meeting virtual. */
  location?: string;
  /** Set `false` for meetings the organizer does not attend. */
  organizerAttending?: boolean;
}

export interface ScheduleMeetingOptions {
  /**
   * Sent as `X-Idempotency-Key` (1-128 chars). Replaying the same key
   * returns the originally created meeting instead of creating a duplicate.
   */
  idempotencyKey?: string;
}

export interface ScheduleMeetingResult {
  meetingId: string;
  negotiationId: string;
  /** `negotiating` on fresh creates; an idempotent replay returns the real status. */
  status: MeetingStatus;
  proposedSlots: Slot[];
}

export interface MeetingParticipant {
  name?: string;
  email?: string;
  phone?: string;
  /** e.g. `pending`, `accepted`, `declined`, `counter-proposed`. */
  status: string;
  attending: boolean;
}

export interface MeetingDetail {
  id: string;
  title: string;
  status: MeetingStatus;
  confirmedSlot?: Slot;
  participants: MeetingParticipant[];
}

export interface MeetingSummary {
  id: string;
  title: string;
  status: MeetingStatus;
  confirmedSlot?: Slot;
  createdAt?: string;
}

export interface ListMeetingsParams {
  status?: MeetingStatus;
  /** 1..50, default 20. */
  limit?: number;
}

export interface ListMeetingsResult {
  meetings: MeetingSummary[];
}

export interface CancelMeetingResult {
  status: 'cancelled';
}

export interface RescheduleMeetingParams {
  /** YYYY-MM-DD. Required. */
  preferredDate: string;
  /** HH:MM (24h). Required. */
  preferredTime: string;
  /** IANA timezone the date/time are expressed in. */
  timezone?: string;
}

export interface RescheduleMeetingResult {
  meetingId: string;
  status: 'negotiating';
  proposedSlots: Slot[];
}

export interface CreateWebhookParams {
  /** Public http(s) endpoint. Private/internal hosts are rejected. */
  url: string;
  /** Defaults to all four events when omitted. */
  events?: WebhookEvent[];
}

export interface WebhookCreated {
  id: string;
  url: string;
  events: WebhookEvent[];
  /** `whsec_` signing secret — returned exactly once, at creation. */
  secret: string;
}

export interface WebhookSummary {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt?: string;
}

export interface ListWebhooksResult {
  webhooks: WebhookSummary[];
}

export interface DeleteWebhookResult {
  deleted: true;
}

/**
 * Body of every webhook delivery POSTed to a subscribed URL. Verify the
 * `X-Zoplio-Signature` header over the RAW request body with
 * `ZoplioClient.verifyWebhookSignature` before trusting it.
 */
export interface WebhookDeliveryBody {
  event: WebhookEvent;
  payload: {
    meetingId?: string;
    organizerUserId?: string;
    title?: string;
    /** Present on confirmed/cancelled/failed events. */
    negotiationId?: string;
    participantEmails?: string[];
    /** Present on meeting.confirmed. */
    confirmedSlot?: Slot;
    [key: string]: unknown;
  };
  /** ISO 8601 delivery timestamp. */
  timestamp: string;
}
