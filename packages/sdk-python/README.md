# zoplio (Python SDK)

Official Zoplio Python SDK for the [Zoplio API v1](../../docs/quickstart.md). MIT licensed.

Zoplio schedules meetings for you: you say who and roughly when, Zoplio negotiates with every participant over WhatsApp/email and confirms a slot.

Requires Python >= 3.10. Depends on `httpx`.

## Install

Not yet published to PyPI — install from this monorepo:

```bash
pip install -e packages/sdk-python
```

## Usage

```python
from zoplio import ZoplioClient, ZoplioError

zoplio = ZoplioClient(api_key="zpl_...")  # base_url defaults to https://api.zoplio.com

# Create a meeting — Zoplio reaches out to participants and negotiates.
created = zoplio.schedule_meeting(
    participants=[
        {"email": "petr@example.com", "name": "Petr"},
        {"phone": "+420777123456", "name": "Jana"},
    ],
    title="Intro call",
    duration_minutes=30,
    preferred_date="2026-06-15",
    preferred_time="14:00",
    timezone="Europe/Prague",
    idempotency_key="order-42-intro-call",  # optional, safe retries
)
print(created["meetingId"], created["status"], created["proposedSlots"])

# Poll status (or use webhooks instead).
meeting = zoplio.get_meeting(created["meetingId"])

# List / reschedule / cancel.
zoplio.list_meetings(status="confirmed", limit=10)
zoplio.reschedule_meeting(
    created["meetingId"],
    preferred_date="2026-06-16",
    preferred_time="10:00",
    timezone="Europe/Prague",
)
zoplio.cancel_meeting(created["meetingId"])
```

## Errors

Every non-2xx response raises `ZoplioError` with the contract envelope:

```python
try:
    zoplio.get_meeting("nope")
except ZoplioError as err:
    err.status_code  # 404
    err.code         # 'not_found' | 'unauthorized' | 'rate_limited' | 'validation_failed' | 'conflict' | 'upstream_error'
    str(err)         # human-readable message
    err.details      # [{"field", "message"}] on validation_failed
```

## Webhooks

```python
# Subscribe — the secret is returned exactly once.
hook = zoplio.create_webhook(
    url="https://example.com/zoplio-hook",
    events=["meeting.confirmed", "meeting.cancelled"],
)
save_secret(hook["secret"])  # whsec_...

zoplio.list_webhooks()
zoplio.delete_webhook(hook["id"])
```

Verify deliveries with the static helper — pass the RAW request body:

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
    delivery = request.get_json()  # {"event", "payload", "timestamp"}
    return "", 200
```
