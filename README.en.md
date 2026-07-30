# SeaTalk Personal GIF Avatar Helper

[中文说明](README.md) | [English](README.en.md)

Set a GIF from your SeaTalk chat as your animated personal avatar. The userscript automatically finds the avatar update entry point for the current SeaTalk version, so no manual bundle search or DevTools breakpoint is required.

> Install in this order: **install the Tampermonkey browser extension first, then install this userscript.**

## Installation

### Step 1: Install Tampermonkey

1. Open the [official Tampermonkey website](https://www.tampermonkey.net/) in Chrome or Edge.
2. Choose your browser and install the extension.
3. Make sure Tampermonkey is enabled.

### Required for first-time installation: allow Tampermonkey to run userscripts

> **If you skip this step, the script may show as installed but will not run on SeaTalk.**

After installing Tampermonkey, complete the following authorization first:

1. Open one of these pages in your browser:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
2. Find **Tampermonkey** and make sure the extension is enabled.
3. Select **Details**, or right-click the Tampermonkey icon and choose **Manage extension**.
4. Find and enable **Allow User Scripts**.
5. If **Allow User Scripts** is not available yet, enable **Developer mode** in the top-right corner of the extensions page.
6. Refresh SeaTalk after completing this step, then continue with this userscript installation.

Open or refresh SeaTalk after installation. The authorization and script installation are both successful only when the **GIF Avatar** button appears on the right side. You can drag the button, and its position is saved automatically.

### Step 2: Install the GIF Avatar Helper

1. Open the [Greasy Fork script page](https://greasyfork.org/en/scripts/588931).
2. Click "Install this script".
3. Tampermonkey will open a confirmation page. Click "Install".
4. Open or refresh [SeaTalk Web](https://seatalkweb.com/).
5. Installation is complete when the "GIF Avatar" button appears on the right side.

## How to use

### Quick try without your own GIF

1. Open SeaTalk Web.
2. Click "GIF Avatar" on the right side. Drag it elsewhere if it covers a SeaTalk control.
3. Click "Try a random GIF avatar".
4. After the success message appears, refresh the page to confirm the new avatar.

### Use your own GIF

1. Send the GIF you want through SeaTalk's sticker button in the current chat. Do not drag it into the chat as a regular image file.
2. Click "GIF Avatar" on the right side.
3. Click "Capture GIFs from this chat". This action only checks the currently open chat.
4. Select one of the 3 most recent detected GIFs.
5. Click "Use this GIF as my avatar" at the bottom of the panel.

## Features

- Apply a random built-in sample when you do not have a GIF ready.
- Capture the 3 most recent GIF stickers from the current chat while ignoring unsupported regular GIF image files.
- Drag the floating button away from SeaTalk controls and keep its saved position.
- Find the current `chunk-styles-*.js` and avatar update entry point on every launch.
- Wait automatically when SeaTalk's update module is still loading, with no repeated clicking required.
- Chinese and English interface with a saved manual language preference.
- Stage-by-stage diagnostics when a SeaTalk frontend change causes a compatibility issue.
- Immediate success feedback after the SeaTalk API confirms the update, without false failures caused by cached avatar URLs.

## Privacy and safety

- Runs only on `seatalkweb.com` pages.
- Does not collect or upload account details, chat content, passwords, cookies, or other personal information.
- Includes no separate analytics or user-tracking service.
- Uses the personal avatar update capability already available in the current SeaTalk page and never modifies another user's avatar.
- Preferences such as language are stored only in Tampermonkey local storage.

## FAQ

**The button does not appear after installation. What should I do?**  
Make sure both Tampermonkey and this userscript are enabled, then refresh SeaTalk Web.

**The script is installed, but the “GIF Avatar” button still does not appear on SeaTalk. What should I do?**
Check that you completed the **Allow User Scripts** authorization above. Open Tampermonkey details in `chrome://extensions` or `edge://extensions` and enable **Allow User Scripts**. If that option is unavailable, enable **Developer mode** in the top-right corner of the extensions page, then refresh SeaTalk.

**The update succeeded, but the old avatar is still visible.**  
This is usually a SeaTalk page cache. Refresh the page and check again.

**The avatar update entry point cannot be found.**  
Allow the automatic check to run for 5 seconds. If it still fails, click "Check again and apply" or refresh SeaTalk; no regular PNG/JPG upload is needed. If the problem continues, expand "Status and diagnostics", keep a screenshot, and report it through GitHub Issues.

**Where does "Capture GIFs" look?**  
It only checks the currently open chat and shows the 3 most recent GIF sticker candidates. GIFs sent as regular image files are ignored because SeaTalk's avatar API does not accept that resource type.

**What if the "GIF Avatar" button covers a SeaTalk control?**
Drag the helper button somewhere else. The script saves the new position and restores it after a refresh.

**How do I disable or uninstall the script?**  
Open the Tampermonkey dashboard and turn off this script to disable it, or delete it to uninstall it.

## Updates and feedback

- Tampermonkey checks for updates from the script source. You can also check manually in the Tampermonkey dashboard.
- When reporting a problem, include the SeaTalk page state, script diagnostics, and reproduction steps in [GitHub Issues](../../issues).
- Never post passwords, cookies, work chat content, or other sensitive information in a public issue.
- See [CHANGELOG.md](CHANGELOG.md) for the complete version history.

## Notes

- Current version: `3.0.2`
- Supported page: SeaTalk Web
- This is an unofficial helper and is not affiliated with, endorsed by, or maintained by SeaTalk.
- A future SeaTalk frontend update may temporarily affect compatibility. Check the diagnostics panel for details.

Made by Yixin.Zhong × Codex
