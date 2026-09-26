# zoplio (Python SDK)

Official Zoplio Python SDK for the [Zoplio API v1](https://github.com/Zoplio/zoplio-sdk/blob/main/docs/quickstart.md). MIT licensed.

Zoplio schedules meetings for you: you say who to invite and roughly when, Zoplio negotiates with every invitee over WhatsApp/email and confirms a slot.

Requires Python >= 3.10. Depends on `httpx`.

## Install

```bash
pip install zoplio
```

## Get an API key

Sign in at [zoplio.com/dashboard/api](https://zoplio.com/dashboard/api) with Google, go to **API keys** and click **Create key**. Keys start with `zpl_`; copy yours right away, it is shown once. The free plan covers 3 confirmed meetings and 15 meeting requests per calendar month (UTC).

## Roles

The account that owns the API key is the organizer. `participants` are the people Zoplio invites. To arrange a meeting for someone else, set `organizer`.

- You are a Zoplio user like anyone on WhatsApp: a meeting you create runs on your calendar, in your timezone and working hours, Zoplio tells you when the invitees answer, and it counts against your plan.
- Every participant (1-8) is invited; one is enough. Your own number or e-mail as a participant is rejected with `validation_failed`.
- `organizer` is the optional on-behalf mode (an agency booking for a client): that person is then the organizer, every participant is still invited, and the meeting still bills to your account.

## Usage

```python
import os
from datetime import date, timedelta

from zoplio import ZoplioClient, ZoplioError

zoplio = ZoplioClient(api_key=os.environ["ZOPLIO_API_KEY"])  # base_url defaults to https://api.zoplio.com


def next_weekday(weekday: int) -> str:
    """The next given weekday (0 = Monday ... 6 = Sunday) after today, as YYYY-MM-DD."""
    today = date.today()
    return (today + timedelta(days=(weekday - today.weekday()) % 7 or 7)).isoformat()


# Create a meeting. You are the organizer; Zoplio invites Jana. With no date
# fields Zoplio proposes free working-day slots over the next week.
created = zoplio.schedule_meeting(
    participants=[{"phone": "+15555550100", "name": "Jana"}],  # fictional number: use a real one
    title="Intro call",
    duration_minutes=30,
    idempotency_key="order-42-intro-call",  # optional, safe retries
)
print(created["meetingId"], created["status"], created["proposedSlots"])

# Somebody who told Zoplio to stop contacting them is never invited. The
# meeting is still created with the rest of the list, so check this before
# you report who it is with; both keys are absent when everybody went in.
if created.get("skippedParticipants"):
    print(created["skippedMessage"], created["skippedParticipants"])
    # -> [{"name": "Jana", "reason": "opted_out"}]

# Poll status (or use webhooks instead). Each entry of meeting["participants"]
# carries status, attending and role ("organizer" | "participant").
meeting = zoplio.get_meeting(created["meetingId"])

# List / reschedule / cancel.
zoplio.list_meetings(status="confirmed", limit=10)
zoplio.reschedule_meeting(
    created["meetingId"],
    preferred_date=next_weekday(3),  # next Thursday
    preferred_time="10:00",
    timezone="Europe/Prague",
    idempotency_key="order-42-intro-call-move-1",  # a retry replays instead of opening another round
)
zoplio.cancel_meeting(created["meetingId"])  # frees the slot on the free plan

# Plan and this month's usage: {"plan", "month", "confirmed", "creates", "limits": {"confirmed", "creates"}}
usage = zoplio.get_usage()
```

An exact time: send `preferred_date` + `preferred_time` + `timezone`, and Jana gets a yes/no for that one slot:

```python
zoplio.schedule_meeting(
    participants=[{"phone": "+15555550100", "name": "Jana"}],
    title="Intro call",
    preferred_date=next_weekday(2),  # next Wednesday
    preferred_time="14:00",
    timezone="Europe/Prague",  # always send it with preferred_time
)
```

On behalf of someone else: set `organizer`. Petr is then the organizer (his calendar and timezone; Zoplio tells him the meeting is being arranged and again once it confirms) and Jana is invited:

```python
zoplio.schedule_meeting(
    organizer={"email": "petr@example.com", "name": "Petr"},
    participants=[{"phone": "+15555550100", "name": "Jana"}],
    title="Intro call",
)
```

Scheduling mode is picked by the date fields you send: exact (`preferred_date` + `preferred_time` + `timezone`), day (`preferred_date` only), range (`earliest_date` + `latest_date`) or open ask (`open_ask=True` plus the window). With no date fields Zoplio proposes one slot per working day over the next seven days at the start of the organizer's working hours (09:00 by default), rendered in each invitee's own timezone.

## Errors

Every non-2xx response raises `ZoplioError` with the contract envelope:

```python
try:
    zoplio.get_meeting("nope")
except ZoplioError as err:
    err.status_code  # 404
    err.code         # 'not_found' | 'unauthorized' | 'rate_limited' | 'validation_failed' | 'conflict' | 'quota_exceeded' | 'upstream_error'
    str(err)         # human-readable message
    err.details      # [{"field", "message"}] on validation_failed
```

`quota_exceeded` (HTTP 402) means your account's free-plan limit was reached this calendar month, the same limits as for any Zoplio user: 3 confirmed meetings and 15 meeting requests per calendar month (UTC). Meetings still being arranged count against the 3 until they confirm or fall through; `str(err)` says which limit it was. `zoplio.get_usage()` shows where you stand, and cancelling a meeting that is still being arranged frees its slot.

`rate_limited` (HTTP 429) means more than 60 requests/min for this key. The response carries a `Retry-After` header (seconds); wait that long before retrying, since throttled requests still count toward the window.

## Webhooks

```python
# Subscribe. The secret is returned exactly once.
hook = zoplio.create_webhook(
    url="https://example.com/zoplio-hook",
    events=["meeting.confirmed", "meeting.rescheduled", "meeting.cancelled"],
    # omit `events` for all five: meeting.created, meeting.confirmed,
    # meeting.cancelled, meeting.rescheduled, negotiation.failed
)
save_secret(hook["secret"])  # whsec_...

zoplio.list_webhooks()
zoplio.delete_webhook(hook["id"])
```

`meeting.rescheduled` fires the moment a confirmed meeting re-opens to move; its payload carries `previousSlot`, and a fresh `meeting.confirmed` (or a cancellation) follows when the renegotiation resolves.

Verify deliveries with the static helper over the RAW request body, then dedupe: delivery is at-least-once and a retry carries the same `X-Zoplio-Delivery-Id` (also the body's `id`).

```python
# e.g. Flask
@app.post("/zoplio-hook")
def zoplio_hook():
    ok = ZoplioClient.verify_webhook_signature(
        request.get_data(),                          # raw bytes
        request.headers.get("X-Zoplio-Signature", ""),
        os.environ["ZOPLIO_WEBHOOK_SECRET"],         # whsec_...
    )
    if not ok:
        return "", 401
    delivery = request.get_json()  # {"id", "event", "payload", "timestamp"}
    if already_handled(delivery.get("id")):  # a retry of an event you processed
        return "", 200
    return "", 200
```

## Development

```bash
pip install -e ".[dev]"
python -m pytest
python -m mypy src/zoplio
```
