[简体中文](https://greasyfork.org/zh-CN/scripts/588931) | **English**

![SeaTalk Sticker Helper](https://raw.githubusercontent.com/Candle-Git/seatalk-personal-gif-avatar-helper/main/docs/images/seatalk-sticker-helper-banner.en.png)

# SeaTalk Sticker Helper · 5.2.0

> **The GIF avatar tool has grown into SeaTalk Sticker Helper.**
>
> Organize, search and share your favorite SeaTalk stickers, and set GIF avatars.


## Install or update

1. Install [Tampermonkey](https://www.tampermonkey.net/) and allow user scripts.
2. Install/update the [existing Greasy Fork script](https://greasyfork.org/en/scripts/588931), checking version **5.2.0**.
3. Disable other previews, reload [SeaTalk Web](https://seatalkweb.com/) and open SeaTalk Sticker Helper.

**Chrome / Edge permission path:** Right-click the Tampermonkey icon → Manage extension → enable **Allow User Scripts**. If this option is unavailable, enable **Developer mode** on the browser extension-management page. Return to SeaTalk and reload.

The original installation name/update identity and existing notes are preserved. The manager may show the old name while the UI uses the new brand.

![Installation](https://raw.githubusercontent.com/Candle-Git/seatalk-personal-gif-avatar-helper/main/docs/images/install-sticker-helper.en.png)

## A new chapter

- **Find the right sticker** with searchable names, keywords, visible text and private notes.
- **Send with confirmation** from a single preview or a selection. Check the conversation, images and count before sending one at a time.
- **Share useful context**: codes can carry names, keywords and sticker text. Keep personal notes and merge keywords by default.
- **Take your settings with you**: export and restore personal notes and manual image-format labels. AI items needing review start unchecked; Select all is available.
- **Filter clearly**: image format, note status and inspection status are separate. Edit notes without inspection; manually label an animation or still image when needed.
- **One interface**: both modules share Chinese / EN settings, consistent names and split/floating layouts.

Personal and group GIF avatars remain available under **GIF avatars**.

## My stickers

1. Open SeaTalk's sticker picker and its heart **Favorites** tab, then open **My stickers**. Keep the native picker mounted.
2. Edit a sticker's name, keywords, text, private note or image format. Saving confirms its notes and clears Needs review.
3. Search and filter. Selections survive paging; Review selected includes items outside the current filter.
4. Send from a preview or Send selected. Verify the destination and images, then confirm. Up to 100 stickers per operation; ordinary direct and group chats only, without threads.

Changing accounts or conversations stops later sends. Unconfirmed results stop without automatic retries. Check the chat and reload before continuing.

## Share and import

Select 1–100 stickers → Share code → copy and send it yourself. Recipients use Import code → Parse and preview → select → confirm adding. Existing favorites are not added again but can receive notes; new stickers need a successful preview.

Codes with notes use `STGIF2` and require 5.2 or compatible previews. Uncheck metadata for legacy `STGIF1`. Private notes and manual format labels are excluded. Codes contain readable resource IDs and optional metadata; availability is not guaranteed forever.

## Personal backup

Settings → Export personal backup saves JSON. On another computer, choose a backup or labels file, preview, select and confirm. Existing notes are kept by default, with keyword merging; choose replacement per item when needed.

Backups include private notes: keep them safe. Notes are stored per account in Tampermonkey. Clearing extension storage or uninstalling may remove them. Restore changes only personal notes and format labels; it never adds, removes or sends stickers and does not back up image files.

## Remove favorites in batches

Select stickers → **Remove selected** → review the images and count → **Confirm removal**. Use Review selected to check items outside the current filter; those items are included in the removal list too.

This removes your favorites, not chat messages. The helper cannot undo removal, and sharing codes do not guarantee recovery. If a result is unconfirmed, reload SeaTalk and check before retrying. Stop waits for the current item before stopping later operations.

## Window and language

Both modules have **中文 / EN** controls. Switching keeps your search, filters and selections. Wide screens use split view; drag the divider to resize, or choose **Float** to move and resize the window. Minimize keeps the current workspace state. Closing or minimizing restores SeaTalk's layout. Reloading clears selections and inspection progress but preserves saved notes.

## GIF avatars

Preview a random example or capture a GIF sent with SeaTalk's sticker picker, then apply. For group avatars, keep editable group settings open and confirm the group and image. Check uncertain results before retrying.

## Privacy and compatibility

Runs only on SeaTalk Web using SeaTalk's own image and business services. No independent tracking service or upload of chats, passwords or cookies to other services. Sending requires your confirmation and uses native SeaTalk actions; uncertain results stop without retries.

The release contains features only, without private candidate labels or a sticker market. See the [5.2.0 release record](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/blob/main/docs/RELEASE_5.2.0.md) for evidence and compatibility limits. Unofficial tool, not affiliated with or endorsed by SeaTalk.

[GitHub Release · 5.2.0](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/releases/tag/v5.2.0) · [Issues](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/issues) · [中文](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper)
