"""Webhook HMAC verification, pinned against the SAME vector the JS SDK and
the webhooks service use (packages/sdk-js/src/__tests__/client.test.ts and
apps/webhooks/src/services/__tests__/webhookSignature.test.ts). A drift here
silently breaks every Python consumer's signature check, so this must match
byte-for-byte."""

from zoplio.client import ZoplioClient

SECRET = "whsec_0123456789abcdef0123456789abcdef0123456789abcdef"
BODY = (
    '{"event":"meeting.confirmed","payload":{"meetingId":"meet_1",'
    '"title":"Standup"},"timestamp":"2026-06-11T08:00:00.000Z"}'
)
SIG = "700d795ed0445ce5a1fb659ef36f540684c5595b2818f96368e4d7062a1f9433"


def test_accepts_known_good_vector_str():
    assert ZoplioClient.verify_webhook_signature(BODY, SIG, SECRET) is True


def test_accepts_known_good_vector_bytes():
    assert ZoplioClient.verify_webhook_signature(BODY.encode("utf-8"), SIG, SECRET) is True


def test_rejects_wrong_signature():
    assert ZoplioClient.verify_webhook_signature(BODY, "0" * 64, SECRET) is False


def test_rejects_tampered_body():
    tampered = BODY.replace("Standup", "Tampered")
    assert ZoplioClient.verify_webhook_signature(tampered, SIG, SECRET) is False


def test_rejects_wrong_secret():
    assert ZoplioClient.verify_webhook_signature(BODY, SIG, "whsec_wrong") is False
