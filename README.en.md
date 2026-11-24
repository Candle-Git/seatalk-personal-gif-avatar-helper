[简体中文](README.md) | **English**

# SeaTalk Sticker Helper · v5.3.0

![Find, send and organize favorite stickers in a chat](docs/images/seatalk-sticker-helper-banner.en.svg)

- **Looking for a laughing sticker?** Click the seal wearing a mint-green scarf beside the chat input and search for “laugh.” Quick stickers searches names and keywords across all your favorites. Check the chat name at the top, then click a sticker to send it.
- **Want to keep a few stickers from a group chat?** Choose **Collect from chat**, drag across the messages and review your selection. Pick a group and confirm to save them together. Text is skipped and repeated stickers count once.

## Install and find the picker

1. Install [Tampermonkey](https://www.tampermonkey.net/) and enable **Allow User Scripts** in its Chrome or Edge extension settings. If the switch is unavailable, enable **Developer mode** on the extensions page.
2. Install or update [SeaTalk Sticker Helper · v5.3.0](https://greasyfork.org/en/scripts/588931). If you have a 5.2 backup to restore, read [Upgrading from 5.2](#upgrading-from-52) first.
3. Reload [SeaTalk Web](https://seatalkweb.com/) and open a direct or group chat. Look for **Quick stickers** in the chat toolbar. If the panel asks you to load favorites, open the heart-shaped **Favorites** tab in SeaTalk’s own sticker picker once, then reopen Quick stickers.

<details>
<summary>Show installation steps and the browser permission switch</summary>

![Three steps from installing Tampermonkey to installing Sticker Helper](docs/images/install-sticker-helper.en.png)

![Where to enable Allow User Scripts in Chrome or Edge](docs/images/allow-user-scripts.dark.en.png)

</details>

## Organize, send and share

Open **Manage stickers** from Quick stickers. The manager starts in **Ungrouped** and searches the current group. Choose **All**, pinned on the left, to search every group.

| What you want to do | How |
| --- | --- |
| Rename or group a batch | Ctrl-click or ⌘-click individual stickers, Shift-click a range, or drag from an empty space to select an area. Choose **Organize selection** to apply a name, move the batch or append keywords. Blank fields keep their values. You’ll see how many names would be replaced. For one sticker, choose **Edit sticker**. |
| Send several to one person or group | Clicking cards in the manager selects them. Choose **Send**, check the chat, images and count, then confirm. A batch can contain up to 100 stickers. |
| Share a set with a friend | Select 1–100 stickers and choose **Share code**. Names and keywords are included by default and can be turned off. Your friend can preview and confirm under **Tools → Import code**. Existing favorites are skipped. By default your friend’s names are kept and keywords are merged without duplicates. |
| Take your settings to another computer | Export a JSON backup under **Settings → Personal data**. Sign into the same account on the other computer, choose the file, preview it and confirm. The backup holds names, keywords, groups, manual image formats and review status. SeaTalk supplies the images. |

For filters, syncing and removing favorites, open **Guide** in the manager’s title bar. Personal settings stay in this browser’s Tampermonkey storage under the current account.

## Upgrading from 5.2

Updating in place keeps your local settings. To restore an old personal backup, import it in 5.2 before upgrading. Version 5.3 reads only `STGIF3` share codes and version 3 personal backups (`schema: 3`). Generate new codes to replace `STGIF1` or `STGIF2` codes, and export a fresh backup before moving to a new computer.

Previously saved sticker text and private notes remain searchable in the original browser. New backups and share codes omit these two fields. Keep your original 5.2 backup if you need an archive.

[5.3.0 release notes](docs/release-notes-5.3.0.md) · [Report an issue](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/issues)
