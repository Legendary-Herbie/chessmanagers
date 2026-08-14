---
name: notifications
description: Implement club-aware in-app notifications and optional email delivery for significant Chess Managers events, with club settings, read state, and delivery independence.
---

# Notifications

Notifications are user-specific records and should include event type, payload, read state, created timestamp, and club context where relevant.

## Delivery

- In-app notifications are persisted.
- Email is asynchronous and optional according to club settings/event policy.
- Email failure does not mark the in-app notification as failed or unread/read differently.

## Significant events

Support the event catalogue approved by the product, including as applicable:
- join request approved/rejected
- player claim approved/rejected
- match recorded for linked players
- match corrected/voided
- announcement published
- tournament events
- admin-relevant club events

## Rules

- Respect club notification settings.
- Do not notify users who are not eligible members for a club-scoped event.
- Never expose private club data in a notification payload sent to an unauthorized recipient.
- Marking a notification read is independent of email delivery.
