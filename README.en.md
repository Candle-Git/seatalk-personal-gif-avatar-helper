# SeaTalk Personal GIF Avatar Helper

[中文说明](README.md) | [English](README.en.md)

Set a GIF from your SeaTalk chat as your animated personal avatar. The userscript automatically finds the avatar update entry point for the current SeaTalk version, so no manual bundle search or DevTools breakpoint is required.

> Install in this order: **install the Tampermonkey browser extension first, then install this userscript.**

## Installation

### Step 1: Install Tampermonkey

1. Open the [official Tampermonkey website](https://www.tampermonkey.net/) in Chrome or Edge.
2. Choose your browser and install the extension.
3. Make sure Tampermonkey is enabled.

### Step 2: Install the GIF Avatar Helper

1. Open the [Greasy Fork script page](https://greasyfork.org/en/scripts/588931).
2. Click "Install this script".
3. Tampermonkey will open a confirmation page. Click "Install".
4. Open or refresh [SeaTalk Web](https://seatalkweb.com/).
5. Installation is complete when the "GIF Avatar" button appears in the bottom-right corner.

## How to use

### Quick try without your own GIF

1. Open SeaTalk Web.
2. Click "GIF Avatar" in the bottom-right corner.
3. Click "Try a random GIF avatar".
4. After the success message appears, refresh the page to confirm the new avatar.

### Use your own GIF

1. Send the GIF you want in the current SeaTalk chat.
2. Click "GIF Avatar" in the bottom-right corner.
3. Click "Capture GIFs from this chat". This action only checks the currently open chat.
4. Select one of the 3 most recent detected GIFs.
5. Click "Use this GIF as my avatar" at the bottom of the panel.

## Features

- Apply a random built-in sample when you do not have a GIF ready.
- Capture the 3 most recent GIFs from the current chat and choose one to use.
- Find the current `chunk-styles-*.js` and avatar update entry point on every launch.
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

**The update succeeded, but the old avatar is still visible.**  
This is usually a SeaTalk page cache. Refresh the page and check again.

**The avatar update entry point cannot be found.**  
SeaTalk may have just changed its frontend code. Expand "Status and diagnostics", keep a screenshot, and report the issue through GitHub Issues.

**Where does "Capture GIFs" look?**  
It only checks the currently open chat and shows the 3 most recent GIF candidates it can detect.

**How do I disable or uninstall the script?**  
Open the Tampermonkey dashboard and turn off this script to disable it, or delete it to uninstall it.

## Updates and feedback

- Tampermonkey checks for updates from the script source. You can also check manually in the Tampermonkey dashboard.
- When reporting a problem, include the SeaTalk page state, script diagnostics, and reproduction steps in [GitHub Issues](../../issues).
- Never post passwords, cookies, work chat content, or other sensitive information in a public issue.

## Notes

- Current version: `3.0.0`
- Supported page: SeaTalk Web
- This is an unofficial helper and is not affiliated with, endorsed by, or maintained by SeaTalk.
- A future SeaTalk frontend update may temporarily affect compatibility. Check the diagnostics panel for details.

Made by Yixin.Zhong × Codex
