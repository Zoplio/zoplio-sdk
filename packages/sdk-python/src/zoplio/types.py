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
    "negotiation.failed",
)


@dataclass
class Slot:
    """A concrete time slot. ISO 8601 datetimes (UTC)."""

    start: str
    end: str


@dataclass
class ParticipantInput:
    """Meeting participant input — needs ``phone`` (E.164) or ``email``."""

    phone: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None


@dataclass
class MeetingParticipant:
    """Participant as returned by ``GET /v1/meetings/:id``."""

    status: str  # pending, accepted, declined, counter-proposed, ...
    attending: bool
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
    ``payload`` carries ``meetingId``, ``organizerUserId``, ``title`` and — on
    confirmed/cancelled/failed events — ``negotiationId``,
    ``participantEmails`` and (when confirmed) ``confirmedSlot``.
    """

    event: str  # one of WEBHOOK_EVENTS, also in the X-Zoplio-Event header
    payload: dict
    timestamp: str  # ISO 8601
