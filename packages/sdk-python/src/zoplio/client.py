"""Client for the Zoplio public API v1 (api-gateway /v1)."""

import hashlib
import hmac
from typing import Any, Optional, Union
from urllib.parse import quote

import httpx


class ZoplioError(Exception):
    """Error raised for every non-2xx API response.

    Carries the contract error envelope ``{"error": {"code", "message",
    "details"?}}``:

    - ``code``: one of ``unauthorized``, ``rate_limited``, ``validation_failed``,
      ``not_found``, ``conflict``, ``quota_exceeded``, ``upstream_error``
    - ``status_code``: HTTP status of the response
    - ``details``: list of ``{"field", "message"}`` on ``validation_failed``
    """

    def __init__(
        self,
        message: str,
        code: str = "upstream_error",
        status_code: int = 0,
        details: Optional[list] = None,
    ):
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.details = details or []


class ZoplioClient:
    """Official Zoplio Python SDK client.

    The account that owns the API key is the organizer: the meeting runs on
    your calendar and Zoplio invites ``participants``. To arrange a meeting
    for someone else, set ``organizer``.

    Usage::

        from zoplio import ZoplioClient

        zoplio = ZoplioClient(api_key="zpl_...")
        created = zoplio.schedule_meeting(
            participants=[{"phone": "+420777123456", "name": "Jana"}],
            title="Intro call",
            preferred_date="2026-09-16",
            preferred_time="14:00",
            timezone="Europe/Prague",
        )
        print(created["meetingId"], created["status"])
    """

    def __init__(self, api_key: str, base_url: str = "https://api.zoplio.com"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self.base_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    def _request(
        self,
        method: str,
        path: str,
        json: Optional[dict] = None,
        params: Optional[dict] = None,
        headers: Optional[dict] = None,
    ) -> Any:
        response = self._client.request(
            method, path, json=json, params=params, headers=headers
        )
        try:
            data = response.json()
        except ValueError:
            data = None
        if not response.is_success:
            err = (data or {}).get("error") or {}
            raise ZoplioError(
                err.get("message", f"Zoplio API error: HTTP {response.status_code}"),
                code=err.get("code", "upstream_error"),
                status_code=response.status_code,
                details=err.get("details"),
            )
        return data

    # ── Meetings ────────────────────────────────────────

    def schedule_meeting(
        self,
        participants: list[dict],
        title: Optional[str] = None,
        duration_minutes: Optional[int] = None,
        preferred_date: Optional[str] = None,
        preferred_time: Optional[str] = None,
        timezone: Optional[str] = None,
        earliest_date: Optional[str] = None,
        latest_date: Optional[str] = None,
        open_ask: Optional[bool] = None,
        location: Optional[str] = None,
        organizer_attending: Optional[bool] = None,
        idempotency_key: Optional[str] = None,
        organizer: Optional[dict] = None,
    ) -> dict:
        """Create a meeting and start negotiating with the participants.

        ``POST /v1/meetings``

        You (the account that owns the API key) are the organizer: the
        meeting runs on your calendar and Zoplio messages every entry of
        ``participants`` (one is enough). Set ``organizer`` to arrange a
        meeting for someone else: they are then the organizer (their calendar
        and timezone; not invited, told that the meeting is being arranged
        and again once it confirms). A participant equal to your own number
        or e-mail raises :class:`ZoplioError` with code ``validation_failed``.

        Scheduling mode is picked by the date fields you send: exact
        (``preferred_date`` + ``preferred_time`` + ``timezone``), day
        (``preferred_date`` only), range (``earliest_date`` + ``latest_date``)
        or open ask (``open_ask=True`` plus the window). With no date fields
        Zoplio proposes one slot per working day over the next seven days at
        the start of the organizer's working hours.

        :param participants: 1-8 dicts, each with ``phone`` (E.164) or
            ``email``, plus optional ``name``. The people Zoplio invites.
        :param organizer: on-behalf mode: dict with ``phone`` or ``email``
            (+ ``name``), the person the meeting is for when it is not you.
            Omit it for your own meetings.
        :param preferred_date: ``YYYY-MM-DD`` (required when
            ``preferred_time`` is set).
        :param preferred_time: ``HH:MM`` 24-hour.
        :param timezone: IANA timezone the date/time are expressed in. Always
            send it with ``preferred_time``: without it the time is read in
            the organizer's stored timezone (your account's zone, UTC for an
            account Zoplio has only seen by e-mail; for an on-behalf organizer
            the phone's country zone, or UTC for an e-mail contact).
        :param idempotency_key: sent as ``X-Idempotency-Key``; replaying the
            same key returns the originally created meeting.
        :returns: ``{"meetingId", "negotiationId", "status", "proposedSlots"}``
        """
        body: dict[str, Any] = {"participants": participants}
        if organizer is not None:
            body["organizer"] = organizer
        if title is not None:
            body["title"] = title
        if duration_minutes is not None:
            body["durationMinutes"] = duration_minutes
        if preferred_date is not None:
            body["preferredDate"] = preferred_date
        if preferred_time is not None:
            body["preferredTime"] = preferred_time
        if timezone is not None:
            body["timezone"] = timezone
        if earliest_date is not None:
            body["earliestDate"] = earliest_date
        if latest_date is not None:
            body["latestDate"] = latest_date
        if open_ask is not None:
            body["openAsk"] = open_ask
        if location is not None:
            body["location"] = location
        if organizer_attending is not None:
            body["organizerAttending"] = organizer_attending

        headers = {"X-Idempotency-Key": idempotency_key} if idempotency_key else None
        return self._request("POST", "/v1/meetings", json=body, headers=headers)

    def get_meeting(self, meeting_id: str) -> dict:
        """Fetch one meeting you created with this key, with each person's
        status and role (``organizer`` or ``participant``).

        ``GET /v1/meetings/:id`` →
        ``{"id", "title", "status", "confirmedSlot"?, "participants"}``
        """
        return self._request("GET", f"/v1/meetings/{quote(meeting_id, safe='')}")

    def list_meetings(
        self, status: Optional[str] = None, limit: Optional[int] = None
    ) -> dict:
        """List meetings you created with this key (on-behalf ones included), newest first.

        ``GET /v1/meetings?status=&limit=`` → ``{"meetings": [...]}``

        :param status: one of ``draft``, ``negotiating``, ``confirmed``,
            ``cancelled``, ``rescheduling``.
        :param limit: 1-50, default 20.
        """
        params: dict[str, Any] = {}
        if status is not None:
            params["status"] = status
        if limit is not None:
            params["limit"] = limit
        return self._request("GET", "/v1/meetings", params=params or None)

    def cancel_meeting(self, meeting_id: str) -> dict:
        """Cancel a meeting (idempotent).

        ``POST /v1/meetings/:id/cancel`` → ``{"status": "cancelled"}``
        """
        return self._request(
            "POST", f"/v1/meetings/{quote(meeting_id, safe='')}/cancel"
        )

    def reschedule_meeting(
        self,
        meeting_id: str,
        preferred_date: str,
        preferred_time: str,
        timezone: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> dict:
        """Propose a new exact date+time to all participants.

        ``POST /v1/meetings/:id/reschedule`` →
        ``{"meetingId", "status": "negotiating", "proposedSlots"}``

        :param timezone: IANA timezone the date/time are expressed in. Always
            send it; without it the time is read in a stored timezone rather
            than yours.
        :param idempotency_key: sent as ``X-Idempotency-Key``. A replay
            returns the original proposal instead of opening another
            negotiation round; every un-keyed call consumes a round, and
            exhausting the round limit cancels the meeting.

        Raises :class:`ZoplioError` with code ``conflict`` when the requested
        time collides with a participant's availability, the negotiation
        state does not allow re-proposing, or the negotiation ran out of
        rounds (the meeting is then cancelled and every participant told);
        code ``validation_failed`` when the time is already in the past.
        """
        body: dict[str, Any] = {
            "preferredDate": preferred_date,
            "preferredTime": preferred_time,
        }
        if timezone is not None:
            body["timezone"] = timezone
        headers = {"X-Idempotency-Key": idempotency_key} if idempotency_key else None
        return self._request(
            "POST",
            f"/v1/meetings/{quote(meeting_id, safe='')}/reschedule",
            json=body,
            headers=headers,
        )

    # ── Webhooks ────────────────────────────────────────

    def create_webhook(self, url: str, events: Optional[list[str]] = None) -> dict:
        """Subscribe a public https URL to meeting lifecycle events.

        ``POST /v1/webhooks`` → ``{"id", "url", "events", "secret"}``

        The host is DNS-resolved and validated at subscribe time: http URLs,
        hosts that do not resolve, and hosts resolving to private/internal
        addresses are rejected (``validation_failed``). The ``whsec_`` secret
        is returned exactly once; store it to verify deliveries. ``events``
        defaults to all five: ``meeting.created``,
        ``meeting.confirmed``, ``meeting.cancelled``, ``meeting.rescheduled``,
        ``negotiation.failed``.
        """
        body: dict[str, Any] = {"url": url}
        if events is not None:
            body["events"] = events
        return self._request("POST", "/v1/webhooks", json=body)

    def list_webhooks(self) -> dict:
        """List your webhook subscriptions (without secrets).

        ``GET /v1/webhooks`` → ``{"webhooks": [...]}``
        """
        return self._request("GET", "/v1/webhooks")

    def delete_webhook(self, webhook_id: str) -> dict:
        """Delete one of your webhook subscriptions.

        ``DELETE /v1/webhooks/:id`` → ``{"deleted": true}``
        """
        return self._request(
            "DELETE", f"/v1/webhooks/{quote(webhook_id, safe='')}"
        )

    @staticmethod
    def verify_webhook_signature(
        raw_body: Union[str, bytes], signature_header: str, secret: str
    ) -> bool:
        """Verify a webhook delivery signature.

        Constant-time comparison of the ``X-Zoplio-Signature`` header against
        ``HMAC-SHA256(secret, raw_body)`` hex-encoded, exactly how Zoplio
        signs deliveries. Pass the RAW request body bytes (before JSON
        parsing; re-serializing the parsed body may not be byte-identical).
        """
        if not signature_header or not secret:
            return False
        body = raw_body.encode("utf-8") if isinstance(raw_body, str) else raw_body
        expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature_header.strip().lower())

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "ZoplioClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
