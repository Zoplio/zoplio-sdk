/**
 * Wire types for the Zoplio public API v1 (served by api-gateway under /v1).
 * Shapes mirror apps/api-gateway/src: these are the exact JSON bodies on the
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

/** Public webhook event names: the only events delivered to subscribers. */
export type WebhookEvent =
  | 'meeting.created'
  | 'meeting.confirmed'
  | 'meeting.cancelled'
  | 'meeting.rescheduled'
  | 'negotiation.failed';

/** A concrete time slot. ISO 8601 datetimes (UTC). */
export interface Slot {
  start: string;
  end: string;
}

/** A person (organizer or participant): needs `phone` (E.164) or `email`. */
export interface ParticipantInput {
  /** E.164 phone number, e.g. `+420777123456`. */
  phone?: string;
  email?: string;
  /** Display name, max 200 chars. */
  name?: string;
}

/**
 * Body of `POST /v1/meetings`. The account that owns the API key is the
 * organizer; `participants` are the people Zoplio invites. To arrange a
 * meeting for someone else, set `organizer`.
 *
 * Scheduling mode is picked by the date fields you send: exact
 * (`preferredDate` + `preferredTime` + `timezone`), day (`preferredDate`
 * only), range (`earliestDate` + `latestDate`) or open ask (`openAsk: true`
 * plus the window). With no date fields Zoplio proposes one slot per working
 * day over the next seven days at the start of the organizer's working hours.
 */
export interface ScheduleMeetingParams {
  /** Max 300 chars. Defaults to "Meeting" server-side. */
  title?: string;
  /** Integer 5..1440. Defaults to 30 server-side. */
  durationMinutes?: number;
  /**
   * On-behalf mode: the person the meeting is for when it is not you. Zoplio
   * uses their calendar and timezone, does not invite them and tells them the
   * meeting is being arranged. When omitted, you (the account that owns the
   * API key) are the organizer.
   */
  organizer?: ParticipantInput;
  /**
   * The people Zoplio invites (1..8), each with a phone or an email; one is
   * enough. Your own number or e-mail is rejected with `validation_failed`.
   */
  participants: ParticipantInput[];
  /** YYYY-MM-DD. Required when `preferredTime` is set. */
  preferredDate?: string;
  /** HH:MM (24h). */
  preferredTime?: string;
  /**
   * IANA timezone the preferredDate/preferredTime are expressed in. Always
   * send it with `preferredTime`: without it the time is read in the
   * organizer's stored timezone (your account's zone, UTC for an account
   * Zoplio has only seen by e-mail; for an on-behalf organizer the phone's
   * country zone, or UTC for an e-mail contact).
   */
  timezone?: string;
  /** YYYY-MM-DD. Start of the window for range and open-ask scheduling. */
  earliestDate?: string;
  /** YYYY-MM-DD. End of the window for range and open-ask scheduling. */
  latestDate?: string;
  /** Ask participants for their availability instead of proposing slots. */
  openAsk?: boolean;
  /** Max 500 chars. Omitting it makes the meeting virtual. */
  location?: string;
  /**
   * Set `false` when the organizer (you, or the on-behalf `organizer`) only
   * arranges the meeting and will not attend; the invitees then meet among
   * themselves, so list at least two of them.
   */
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
  /**
   * `organizer` is the person the meeting is for (you, or the on-behalf
   * `organizer`); `participant` is an invitee.
   */
  role: 'organizer' | 'participant';
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
  /**
   * IANA timezone the date/time are expressed in. Always send it; without it
   * the time is read in a stored timezone rather than yours.
   */
  timezone?: string;
}

export interface RescheduleMeetingOptions {
  /**
   * Sent as `X-Idempotency-Key` (1-128 chars). Replaying the same key returns
   * the original proposal instead of opening another negotiation round, so a
   * retry cannot walk the meeting into the round-limit cancellation. Send a
   * new key when you genuinely want to move the meeting again.
   */
  idempotencyKey?: string;
}

export interface RescheduleMeetingResult {
  meetingId: string;
  status: 'negotiating';
  proposedSlots: Slot[];
}

export interface CreateWebhookParams {
  /**
   * Public https endpoint. The host is DNS-resolved and validated at
   * subscribe time: http URLs, hosts that do not resolve, and hosts
   * resolving to private/internal addresses are rejected.
   */
  url: string;
  /** Defaults to all five events when omitted. */
  events?: WebhookEvent[];
}

export interface WebhookCreated {
  id: string;
  url: string;
  events: WebhookEvent[];
  /** `whsec_` signing secret, returned exactly once, at creation. */
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
    /**
     * The account that owns the API key; equals organizerUserId unless the
     * meeting was arranged on behalf of someone else.
     */
    billingAccountId?: string;
    title?: string;
    /** Present on confirmed/cancelled/failed events. */
    negotiationId?: string;
    participantEmails?: string[];
    /** Present on meeting.confirmed. */
    confirmedSlot?: Slot;
    /** Present on meeting.rescheduled: the slot the meeting left. */
    previousSlot?: Slot;
    [key: string]: unknown;
  };
  /** ISO 8601 delivery timestamp. */
  timestamp: string;
}
