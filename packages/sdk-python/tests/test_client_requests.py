"""Request plumbing pinned against the gateway contract, no network:
a single participant without organizer is sent as-is (the key owner is the
organizer server-side), organizer (on-behalf mode) travels in the body,
X-Idempotency-Key is sent on create AND on reschedule only when a key is
given, and the error envelope is surfaced."""

import json

import httpx
import pytest

from zoplio.client import ZoplioClient, ZoplioError


def _mock_client(status_code=200, body=None):
    """A ZoplioClient whose httpx transport records requests instead of
    hitting the network. Returns (client, calls)."""
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(status_code, json=body if body is not None else {})

    client = ZoplioClient(api_key="zpl_abc", base_url="https://api.example.com/")
    client._client = httpx.Client(
        base_url=client.base_url,
        headers={"Authorization": "Bearer zpl_abc", "Content-Type": "application/json"},
        transport=httpx.MockTransport(handler),
    )
    return client, calls


def test_schedule_meeting_sends_on_behalf_organizer_and_idempotency_key():
    client, calls = _mock_client(
        201,
        {"meetingId": "m1", "negotiationId": "n1", "status": "negotiating", "proposedSlots": []},
    )
    result = client.schedule_meeting(
        organizer={"email": "petr@example.com", "name": "Petr"},
        participants=[{"phone": "+420777123456", "name": "Jana"}],
        title="Intro call",
        preferred_date="2026-09-16",
        preferred_time="14:00",
        timezone="Europe/Prague",
        idempotency_key="key-1",
    )
    assert result["meetingId"] == "m1"
    assert len(calls) == 1
    req = calls[0]
    assert req.method == "POST"
    assert str(req.url) == "https://api.example.com/v1/meetings"
    assert req.headers["Authorization"] == "Bearer zpl_abc"
    assert req.headers["X-Idempotency-Key"] == "key-1"
    body = json.loads(req.content)
    assert body["organizer"] == {"email": "petr@example.com", "name": "Petr"}
    assert body["participants"] == [{"phone": "+420777123456", "name": "Jana"}]
    assert body["preferredDate"] == "2026-09-16"
    assert body["timezone"] == "Europe/Prague"


def test_schedule_meeting_single_participant_sends_no_organizer():
    # One participant and no organizer: the key owner is the organizer
    # server-side, so the SDK sends exactly what it was given.
    client, calls = _mock_client(201, {"meetingId": "m1"})
    client.schedule_meeting(participants=[{"email": "a@b.cz"}])
    body = json.loads(calls[0].content)
    assert body == {"participants": [{"email": "a@b.cz"}]}
    assert "organizer" not in body
    assert "X-Idempotency-Key" not in calls[0].headers


def test_reschedule_sends_idempotency_key_when_given():
    client, calls = _mock_client(
        200, {"meetingId": "m1", "status": "negotiating", "proposedSlots": []}
    )
    client.reschedule_meeting(
        "m1",
        preferred_date="2026-09-17",
        preferred_time="10:00",
        timezone="Europe/Prague",
        idempotency_key="move-1",
    )
    req = calls[0]
    assert str(req.url) == "https://api.example.com/v1/meetings/m1/reschedule"
    assert req.headers["X-Idempotency-Key"] == "move-1"
    assert json.loads(req.content) == {
        "preferredDate": "2026-09-17",
        "preferredTime": "10:00",
        "timezone": "Europe/Prague",
    }


def test_reschedule_without_key_sends_no_idempotency_header():
    client, calls = _mock_client(200, {"meetingId": "m1"})
    client.reschedule_meeting("a/b", preferred_date="2026-09-17", preferred_time="10:00")
    req = calls[0]
    assert str(req.url) == "https://api.example.com/v1/meetings/a%2Fb/reschedule"
    assert "X-Idempotency-Key" not in req.headers
    assert "timezone" not in json.loads(req.content)


def test_error_envelope_is_raised_as_zoplio_error():
    client, _ = _mock_client(
        402,
        {
            "error": {
                "code": "quota_exceeded",
                "message": "You have reached this month's limit of 15 new meeting requests on the free plan.",
            }
        },
    )
    with pytest.raises(ZoplioError) as info:
        client.schedule_meeting(
            organizer={"email": "petr@example.com"}, participants=[{"email": "jana@example.com"}]
        )
    assert info.value.code == "quota_exceeded"
    assert info.value.status_code == 402
    assert "15 new meeting requests" in str(info.value)
