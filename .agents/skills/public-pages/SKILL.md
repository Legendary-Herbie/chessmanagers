---
name: public-pages
description: Implement public and private club visibility, public club pages, public leaderboards, public player information, and privacy boundaries for unauthenticated visitors.
---

# Public Pages

## Public clubs

Public pages may expose:
- club name
- logo/banner
- description
- location/contact/social links as configured
- federation information
- top leaderboard summary

Do not expose private account fields.

## Private clubs

Private clubs must not appear in public discovery. Direct access should expose only the limited private-club presentation approved by the product, plus join/invite mechanisms where applicable.

## Authorization

Never rely on frontend hiding. Public endpoints must enforce visibility at the backend.

## Player data

Only public player fields may be exposed. User authentication details, private profile data, and internal identifiers must remain protected.
