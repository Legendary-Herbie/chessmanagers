---
name: announcements
description: Implement club-specific rich-text announcements, attachments, images, publication, visibility, editing, archiving, and notification integration.
---

# Announcements

Announcements belong to one club.

## Permissions

Club Admin/Owner may create, edit, publish, archive, and delete according to club settings.
Members may read announcements they are entitled to see.

## Content

Support rich text plus optional image/attachment uploads as defined by the application's storage layer.
Validate upload type, size, ownership, and access.

## Lifecycle

At minimum support draft/published/archived behavior where the UI requires it. Do not create scheduled-expiry behavior unless explicitly requested.

## Notifications

Publishing a notification-enabled announcement should trigger the notification system according to club settings.
