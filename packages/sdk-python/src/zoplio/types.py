"""Reference shapes for the Zoplio public API v1 wire format.

:class:`~zoplio.client.ZoplioClient` returns plain dicts straight off the
wire; these dataclasses document the shapes (mirroring the TypeScript SDK's
types) for IDE help and type-checked application code.
"""

from dataclasses import dataclass, field
from typing import Optional

MEETING_STATUSES = ("draft", "negotiating", "confirmed", "cancelled", "rescheduling")

WEBHOOK_EVENTS = (
    "meeting.created",
    "meeting.confirmed",
    "meeting.cancelled",
    "meeting.rescheduled",
    "negotiation.failed",
)


@dataclass
class Slot:
    """A concrete time slot. ISO 8601 datetimes (UTC)."""

    start: str
    end: str


@dataclass
class ParticipantInput:
    """A person (organizer or participant): needs ``phone`` (E.164) or ``email``."""

    phone: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None


#: Known reasons somebody on the ``participants`` list was not invited. The
#: wire value is an open string: a value you do not recognise still means
#: "not invited, reason unrecognised", never an error.
SKIPPED_REASONS = ("opted_out",)


@dataclass
class SkippedParticipant:
    """Somebody listed in ``participants`` who was NOT invited.

    Zoplio identifies the person by the ``name`` it holds for them: the
    address they were dropped under is Zoplio's own, not necessarily the
    contact you sent, so ``email`` / ``phone`` appear only when Zoplio knows
    the contact is exactly the one from your request. Today entries carry
    ``name`` and ``reason``. ``opted_out`` means that person told Zoplio to
    stop contacting them: their decision, account-wide, outliving any one
    meeting, so no invitation goes out however the meeting is booked.
    """

    reason: str  # open string; SKIPPED_REASONS lists the known values
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


@dataclass
class ScheduleMeetingResult:
    """``POST /v1/meetings`` response.

    ``skipped_participants`` (wire key ``skippedParticipants``) is present, and
    non-empty, only when the meeting was created with fewer people than the
    request listed; its absence means everybody was invited. It is a normal
    part of a successful create, never an error, so read it before reporting
    who the meeting is with. If EVERY participant had opted out there is
    nobody to invite and the call raises ``validation_failed`` instead.
    """

    meeting_id: str  # wire key: meetingId
    negotiation_id: str  # wire key: negotiationId
    status: str  # one of MEETING_STATUSES; "negotiating" on fresh creates
    proposed_slots: list[Slot] = field(default_factory=list)  # wire: proposedSlots
    skipped_participants: list[SkippedParticipant] = field(default_factory=list)
    skipped_message: Optional[str] = None  # wire key: skippedMessage


@dataclass
class MeetingParticipant:
    """Person as returned by ``GET /v1/meetings/:id``: the organizer entry
    (you, or the on-behalf ``organizer``) and one entry per invitee."""

    status: str  # pending, accepted, declined, counter-proposed, ...
    attending: bool
    role: str  # "organizer" | "participant"
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


@dataclass
class MeetingDetail:
    """``GET /v1/meetings/:id`` response."""

    id: str
    title: str
    status: str  # one of MEETING_STATUSES
    participants: list[MeetingParticipant] = field(default_factory=list)
    confirmed_slot: Optional[Slot] = None  # wire key: confirmedSlot


@dataclass
class MeetingSummary:
    """Entry of ``GET /v1/meetings`` → ``{"meetings": [...]}``."""

    id: str
    title: str
    status: str
    confirmed_slot: Optional[Slot] = None  # wire key: confirmedSlot
    created_at: Optional[str] = None  # wire key: createdAt


@dataclass
class Usage:
    """``GET /v1/usage`` response: your plan and this UTC month's usage.

    ``limits`` is ``{"confirmed": int | None, "creates": int | None}``
    (``None`` = uncapped; only the ``free`` plan is capped). ``confirmed``
    already includes referral and purchased credits. On the free plan a new
    meeting is refused (402 ``quota_exceeded``) once confirmed meetings, or
    confirmed plus still-being-arranged meetings, reach ``limits["confirmed"]``,
    or once ``creates`` reaches ``limits["creates"]``.
    """

    plan: str  # free | paid | pro | vip | enterprise
    month: str  # YYYY-MM (UTC)
    confirmed: int
    creates: int
    limits: dict  # {"confirmed": int | None, "creates": int | None}


@dataclass
class WebhookCreated:
    """``POST /v1/webhooks`` response. ``secret`` is returned exactly once."""

    id: str
    url: str
    events: list[str]
    secret: str  # whsec_...


@dataclass
class WebhookSummary:
    """Entry of ``GET /v1/webhooks`` → ``{"webhooks": [...]}`` (no secret)."""

    id: str
    url: str
    events: list[str]
    active: bool
    created_at: Optional[str] = None  # wire key: createdAt


@dataclass
class WebhookDelivery:
    """Body POSTed to a subscribed URL.

    Verify ``X-Zoplio-Signature`` over the raw body with
    :meth:`zoplio.ZoplioClient.verify_webhook_signature` before trusting it.
    ``payload`` carries ``meetingId``, ``organizerUserId``,
    ``billingAccountId`` (the account that owns the API key; equals
    ``organizerUserId`` unless the meeting was arranged on behalf of someone
    else), ``title`` and, on confirmed/cancelled/failed events,
    ``negotiationId`` and ``participantEmails``; ``confirmedSlot`` when
    confirmed and ``previousSlot`` (the slot the meeting left) on
    ``meeting.rescheduled``.

    ``id`` is the stable id of the logical event, identical to the
    ``X-Zoplio-Delivery-Id`` header and the same on every retry. Deliveries
    are at-least-once: dedupe on it.
    """

    event: str  # one of WEBHOOK_EVENTS, also in the X-Zoplio-Event header
    payload: dict
    timestamp: str  # ISO 8601
    id: Optional[str] = None  # also the X-Zoplio-Delivery-Id header
