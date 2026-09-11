import { createHmac, timingSafeEqual } from 'crypto';
import {
  ApiErrorCode,
  CancelMeetingResult,
  CreateWebhookParams,
  DeleteWebhookResult,
  FieldDetail,
  ListMeetingsParams,
  ListMeetingsResult,
  ListWebhooksResult,
  MeetingDetail,
  RescheduleMeetingOptions,
  RescheduleMeetingParams,
  RescheduleMeetingResult,
  ScheduleMeetingOptions,
  ScheduleMeetingParams,
  ScheduleMeetingResult,
  WebhookCreated,
  ZoplioConfig,
} from './types';

/**
 * Error thrown for every non-2xx API response. Carries the contract error
 * envelope: `{ error: { code, message, details? } }`.
 */
export class ZoplioApiError extends Error {
  /** Contract error code, e.g. `validation_failed`, `rate_limited`. */
  readonly code: ApiErrorCode;
  /** HTTP status of the response. */
  readonly status: number;
  /** Per-field details on `validation_failed` errors. */
  readonly details?: FieldDetail[];

  constructor(status: number, code: ApiErrorCode, message: string, details?: FieldDetail[]) {
    super(message);
    this.name = 'ZoplioApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ErrorEnvelope {
  error?: { code?: ApiErrorCode; message?: string; details?: FieldDetail[] };
}

/**
 * Client for the Zoplio public API v1.
 *
 * ```ts
 * const zoplio = new ZoplioClient({ apiKey: process.env.ZOPLIO_API_KEY! });
 * const { meetingId } = await zoplio.scheduleMeeting({
 *   title: 'Intro call',
 *   participants: [{ phone: '+420777123456', name: 'Jana' }],
 *   preferredDate: '2026-09-16',
 *   preferredTime: '14:00',
 *   timezone: 'Europe/Prague',
 * });
 * ```
 *
 * The account that owns the API key is the organizer: the meeting runs on
 * your calendar and Zoplio invites `participants`. To arrange a meeting for
 * someone else, set `organizer`.
 *
 * Requires a `fetch` global (Node.js >= 18).
 */
export class ZoplioClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: ZoplioConfig) {
    if (!config || typeof config.apiKey !== 'string' || config.apiKey.length === 0) {
      throw new Error('ZoplioClient requires an apiKey (zpl_...)');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://api.zoplio.com').replace(/\/+$/, '');
  }

  private async request<T>(
    method: string,
    path: string,
    body?: object,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = undefined;
    }

    if (!res.ok) {
      const err = (data as ErrorEnvelope | undefined)?.error;
      throw new ZoplioApiError(
        res.status,
        err?.code ?? 'upstream_error',
        err?.message ?? `Zoplio API error: HTTP ${res.status}`,
        err?.details,
      );
    }
    return data as T;
  }

  // ── Meetings ───────────────────────────────────────────────────────

  /**
   * Create a meeting and start negotiating with the participants.
   * `POST /v1/meetings`
   *
   * You (the account that owns the API key) are the organizer: the meeting
   * runs on your calendar and Zoplio messages every entry of
   * `params.participants` (one is enough). Set `params.organizer` to arrange
   * a meeting for someone else: they are then the organizer (their calendar
   * and timezone; not invited, told that the meeting is being arranged and
   * again once it confirms). A participant equal to your own number or
   * e-mail throws `ZoplioApiError` with code `validation_failed`.
   * Always send `timezone` with `preferredTime`.
   */
  async scheduleMeeting(
    params: ScheduleMeetingParams,
    options?: ScheduleMeetingOptions,
  ): Promise<ScheduleMeetingResult> {
    const headers = options?.idempotencyKey
      ? { 'X-Idempotency-Key': options.idempotencyKey }
      : undefined;
    return this.request('POST', '/v1/meetings', params, headers);
  }

  /**
   * Fetch one meeting you created with this key, with each person's status
   * and role (`organizer` or `participant`).
   * `GET /v1/meetings/:id`
   */
  async getMeeting(meetingId: string): Promise<MeetingDetail> {
    return this.request('GET', `/v1/meetings/${encodeURIComponent(meetingId)}`);
  }

  /**
   * List meetings you created with this key (on-behalf ones included), newest first.
   * `GET /v1/meetings?status=&limit=`
   */
  async listMeetings(params: ListMeetingsParams = {}): Promise<ListMeetingsResult> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    const qs = query.toString();
    return this.request('GET', `/v1/meetings${qs ? `?${qs}` : ''}`);
  }

  /**
   * Cancel a meeting (idempotent: cancelling twice still returns `cancelled`).
   * `POST /v1/meetings/:id/cancel`
   */
  async cancelMeeting(meetingId: string): Promise<CancelMeetingResult> {
    return this.request('POST', `/v1/meetings/${encodeURIComponent(meetingId)}/cancel`);
  }

  /**
   * Propose a new exact date+time to all participants.
   * `POST /v1/meetings/:id/reschedule`
   *
   * Pass `options.idempotencyKey` so a retry replays the original proposal
   * instead of opening another negotiation round: every un-keyed call
   * consumes a round, and exhausting the round limit cancels the meeting.
   *
   * Throws `ZoplioApiError` with code `conflict` when the requested time
   * collides with a participant's availability, when the negotiation state
   * does not allow re-proposing, or when the negotiation ran out of rounds:
   * in that last case the meeting has been cancelled and every participant
   * told. Throws code `validation_failed` when the requested time is already
   * in the past; nothing changed and nobody was contacted.
   */
  async rescheduleMeeting(
    meetingId: string,
    params: RescheduleMeetingParams,
    options?: RescheduleMeetingOptions,
  ): Promise<RescheduleMeetingResult> {
    const headers = options?.idempotencyKey
      ? { 'X-Idempotency-Key': options.idempotencyKey }
      : undefined;
    return this.request(
      'POST',
      `/v1/meetings/${encodeURIComponent(meetingId)}/reschedule`,
      params,
      headers,
    );
  }

  // ── Webhooks ───────────────────────────────────────────────────────

  /**
   * Subscribe a URL to meeting lifecycle events (all five when `events` is
   * omitted). The returned `secret` (whsec_...) is shown exactly once: store
   * it to verify deliveries.
   * `POST /v1/webhooks`
   */
  async createWebhook(params: CreateWebhookParams): Promise<WebhookCreated> {
    return this.request('POST', '/v1/webhooks', params);
  }

  /**
   * List your webhook subscriptions (without secrets).
   * `GET /v1/webhooks`
   */
  async listWebhooks(): Promise<ListWebhooksResult> {
    return this.request('GET', '/v1/webhooks');
  }

  /**
   * Delete one of your webhook subscriptions.
   * `DELETE /v1/webhooks/:id`
   */
  async deleteWebhook(webhookId: string): Promise<DeleteWebhookResult> {
    return this.request('DELETE', `/v1/webhooks/${encodeURIComponent(webhookId)}`);
  }

  /**
   * Verify a webhook delivery: constant-time comparison of the
   * `X-Zoplio-Signature` header against HMAC-SHA256(secret, rawBody),
   * hex-encoded, exactly how Zoplio signs deliveries.
   *
   * Pass the RAW request body bytes/string (before any JSON parsing:
   * re-serializing the parsed body may not be byte-identical).
   */
  static verifyWebhookSignature(
    rawBody: string | Uint8Array,
    signatureHeader: string,
    secret: string,
  ): boolean {
    if (!signatureHeader || !secret) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = signatureHeader.trim().toLowerCase();
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
