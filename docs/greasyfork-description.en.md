![SeaTalk GIF Avatar Helper](https://raw.githubusercontent.com/Candle-Git/seatalk-personal-gif-avatar-helper/main/docs/images/seatalk-gif-avatar-helper-banner.dark.en.png)

# SeaTalk GIF Avatar Helper · 5.0.0

Use chat GIF stickers as personal or group avatars, and organize and share favorite stickers in batches.

**[Full visual guide and FAQ](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/blob/main/README.en.md)**

## New in 5.0

- **Personal-avatar compatibility:** Register the resource for avatar use and verify identical file contents before applying, preserving animation and name.
- **My favorites:** Search, enlarge previews, identify animation, select across pages, review selections and remove after confirmation.
- **Share codes:** Share 1–100 stickers. Recipients paste, preview, select and confirm; existing favorites are skipped.
- **Automatic split view:** On wide screens, SeaTalk stays left and the helper opens right. Close/minimize restores the original layout; smaller screens use a floating window.
- **Consistent controls:** Clear title bars, red close buttons, minimize/restore, floating-window dragging/resizing and an always-available guide.

The sticker market is excluded. The avatar helper is bilingual; the favorites workspace currently uses Chinese labels.

## Install and upgrade

![Install in three steps](https://raw.githubusercontent.com/Candle-Git/seatalk-personal-gif-avatar-helper/main/docs/images/install-in-3-steps.dark.en.png)

1. Install and enable the extension from the [Tampermonkey website](https://www.tampermonkey.net/).
2. **Right-click** its icon, choose **Manage extension**, and enable **Allow User Scripts**. If unavailable, enable **Developer mode** on the browser extension page.
3. Click **Install this script** above and reload [SeaTalk Web](https://seatalkweb.com/). Open the **GIF Avatar** button.

The original installation identity is preserved. Disable other beta/preview copies, keep one helper enabled, then update and reload. Review any permission prompt.

![Allow User Scripts permission guide](https://raw.githubusercontent.com/Candle-Git/seatalk-personal-gif-avatar-helper/main/docs/images/allow-user-scripts.dark.en.png)

## How to use

**Avatars:** Preview a random GIF and apply with the main button. Or send a GIF through SeaTalk's sticker button and capture it from chat. Group changes require editable group settings to stay open and confirmation of the group name and image.

**Favorites:** Open the native heart **Favorites** tab before opening **我的收藏 (My favorites)**. Keep the native panel mounted and do not switch chats during operations. The helper hides it temporarily, then restores it when minimized or closed.

- Browsing and sharing need no scan. For animated-only filtering, choose **识别动图 (Identify animation)** first.
- Paging and filtering retain selections. **全选本页** selects only the current page; **查看已选** reviews all selections.
- Share: Select → **生成分享口令** → copy the complete code and send it yourself. Limit: 100 stickers per code.
- Add: **导入口令** → paste → **解析并预览** → select → confirm. Existing favorites are skipped; failed previews cannot be added.
- Remove: Select → **删除所选表情** → review images and count → confirm. This removes your favorites only, not chat messages. It cannot be undone in the helper, and codes do not guarantee recovery.

If an add/removal result is unconfirmed, reload SeaTalk and verify before retrying. Stopping waits for the current item result; reloading clears selections.

## Privacy and compatibility

The interface runs only on SeaTalk Web. Capture, inspection, preview, avatar registration and adding favorites use SeaTalk's image/business services. There is no separate analytics or tracking service and no upload of chats, passwords or cookies to other services. Session credentials stay in the page. Codes contain resource identifiers and share names, not accounts, credentials or signed image URLs. Codes are not encrypted, cannot guarantee permanent resource availability, and are never sent automatically.

The underlying personal-avatar flow succeeded in a real SeaTalk 3.71.1 browser session and survived reload. See the separate automated, simulated UI and packaged-account scope in the [5.0.0 validation record](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/blob/main/docs/RELEASE_5.0.0.md). Cross-account imports still need further validation.

For problems, copy sanitized diagnostics from **Status and diagnostics** and report through [GitHub Issues](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/issues). Redact names, chats and image-URL parameters.

This is an unofficial tool, unaffiliated with and not endorsed by SeaTalk.
