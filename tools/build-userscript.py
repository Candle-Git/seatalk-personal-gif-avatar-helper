"""Build the market-free formal userscript. Does not install or publish anything."""
from pathlib import Path
import subprocess
import sys
import argparse
import tempfile

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description='Build the formal SeaTalk GIF helper from reviewed local sources.')
parser.add_argument('--version', default='5.2.0')
parser.add_argument('--output', default='SeaTalk-Personal-GIF-Avatar-Helper.user.js')
args = parser.parse_args()
version = args.version
output = root / args.output
output.parent.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, str(root / 'tools/build-resource-avatar-beta.py'),
    '--source', 'tools/base/collections-base.user.js',
    '--version', version, '--output', str(output)], check=True)
source = output.read_text()
replacements = {
    'SeaTalk GIF 助手（收藏整合测试版）': 'SeaTalk GIF 助手（5.0 预览版）',
    'SeaTalk GIF Helper (Collections Beta)': 'SeaTalk GIF Helper (5.0 Preview)',
    '个人与群 GIF 头像、收藏预览筛选、批量管理和候选导出，本地测试版。': '个人与群 GIF 头像、收藏预览筛选和批量管理。5.0 预览版。',
    'Personal and group GIF avatars, favorites curation and batch management. Local beta.': 'Personal and group GIF avatars, favorites previews, filtering and batch management. 5.0 preview.',
    '收藏整合测试版：在 SeaTalk Web 内筛选表情，准备你的市场候选清单。': '5.0 预览版：适配新版个人 GIF 头像，新增收藏表情批量管理。',
    'Collections beta: curate stickers in SeaTalk Web for the next market experiment.': '5.0 preview: updated personal GIF avatars and batch management for favorite stickers.',
    '收藏删除有预览和二次确认；表情市场将后续验证': '修复个人 GIF 头像更新；收藏删除须预览并确认',
    'Deletion requires preview and confirmation; the market comes later': 'Fix personal GIF avatar updates; preview and confirm favorite removals',
    '勾选、命名并导出候选 JSON，切换功能保留当前选择': '勾选、填写导出名称并导出 JSON，切换功能保留当前选择',
    'Name and export selected candidates; switching preserves selections': 'Name and export selections; switching tools preserves selections',
    '候选表情': '收藏表情',
    '已选预设': '已选收藏',
    '加入候选': '选择此表情',
    '点击图片放大预览，勾选并填写名称后导出。': '点击图片放大预览，勾选后可批量删除或导出。名称仅用于导出，不修改 SeaTalk 收藏。',
}
for old, new in replacements.items():
    assert old in source, old
    source = source.replace(old, new)
start = source.index('function launchFavoritesGallery(')
end = source.index('\n  function init()', start)
workspace = (root / 'tools/favorites-workspace.js').read_text()
workspace = workspace.replace('  /* FAVORITES_I18N */', (root / 'tools/favorites-i18n.js').read_text())
workspace = workspace.replace('  /* PERSONAL_CORE */', (root / 'tools/personal-settings-core.js').read_text())
workspace = workspace.replace('  /* SEND_CORE */', (root / 'tools/sticker-send-core.js').read_text())
workspace = workspace.replace('  /* PERSONAL_MARKUP */', (root / 'tools/personal-settings-markup.html').read_text())
workspace = workspace.replace('  /* PERSONAL_UI */', (root / 'tools/personal-settings-ui.js').read_text())
workspace = workspace.replace('  /* SEND_UI */', (root / 'tools/sticker-send-ui.js').read_text())
workspace = workspace.replace('  /* WORKSPACE_ACCOUNT */', (root / 'tools/workspace-account.js').read_text())
workspace = workspace.replace('  /* SHARE_HELPERS */', (root / 'tools/sticker-share.js').read_text())
workspace = workspace.replace('  /* WORKSPACE_TASKS */', (root / 'tools/favorites-tasks.js').read_text())
workspace = workspace.replace('  /* WORKSPACE_GEOMETRY */', (root / 'tools/favorites-geometry.js').read_text())
workspace = workspace.replace('  /* SHARE_UI */', (root / 'tools/sticker-share-ui.js').read_text())
split_source = (root / 'tools/helper-split-layout.js').read_text()
plan = split_source[:split_source.index('function installHelperLayout()')]
installer = split_source[split_source.index('function installHelperLayout()'):].replace('  /* SPLIT_PLAN */', plan)
source = source[:start] + workspace + '\n' + installer + source[end:]
source = source.replace('  function init() {', (root / 'tools/personal-settings-core.js').read_text() + '\n' + (root / 'tools/personal-settings-bridge.js').read_text() + '\n  function init() {', 1)
source = source.replace('  function init() {', '  function init() {\n    installPersonalSettingsBridge();', 1)
source = source.replace(
    '${JSON.stringify(LOCAL_GIF_PRESETS.map(({ label, gifId }) => ({ label, gifId })))});',
    '${JSON.stringify(LOCAL_GIF_PRESETS.map(({ label, gifId }) => ({ label, gifId })))}, ${JSON.stringify(state.locale)});')
locale_block = '          state.locale = locale;\n          saveState();\n          renderPanel();'
assert source.count(locale_block) == 1
source = source.replace(locale_block, '          setHelperLocale(locale);')
locale_bridge = '''  function setHelperLocale(locale) {
    if (locale !== "zh" && locale !== "en") return;
    state.locale = locale;
    saveState();
    renderPanel();
    window.dispatchEvent(new CustomEvent("spga:locale-change", {detail:locale}));
  }
  if (typeof window !== "undefined") window.addEventListener("spga:locale-request", event => setHelperLocale(event.detail));
'''
source = source.replace('  function init() {', locale_bridge + '  function init() {', 1)

bridge = '''  function startHelperLayout() {
    try {
      if (typeof unsafeWindow !== "undefined" && typeof unsafeWindow.Function === "function") {
        unsafeWindow.Function(`return (${installHelperLayout.toString()})();`)();
      }
    } catch (_) { /* Keep the ordinary floating helper if layout setup is unavailable. */ }
  }
'''
source = source.replace('  function init() {', bridge + '  function init() {\n    startHelperLayout();')
source = source.replace('      launchFavoritesGallery, openCollectionsWorkspace,', '      installHelperLayout, launchFavoritesGallery, openCollectionsWorkspace,')

source = source.replace('勾选、填写导出名称并导出 JSON，切换功能保留当前选择', '选择表情生成分享口令，导入口令预览并批量添加')
source = source.replace('Name and export selections; switching tools preserves selections', 'Share selected stickers with a code; preview and import shared stickers')
# Align the compact avatar panel with the same header and control styling.
source = source.replace('title: "SeaTalk GIF 头像助手"', 'title: "SeaTalk GIF 助手"')
source = source.replace('title: "SeaTalk GIF Avatar"', 'title: "SeaTalk GIF Helper"')
source = source.replace('helperToggle: "GIF头像助手"', 'helperToggle: "SeaTalk GIF 助手"')
source = source.replace('helperToggle: "GIF Avatar"', 'helperToggle: "SeaTalk GIF Helper"')
old = '    close.addEventListener("click", () => panel.classList.remove("spga-open"));\n    header.append(close);'
new = '''    close.classList.add("spga-window-close");
    close.title = groupText("关闭助手，保留当前选择", "Close helper; keep your selection");
    close.addEventListener("click", () => panel.classList.remove("spga-open"));
    const minimize = createButton("−", "minimize-panel");
    minimize.classList.add("spga-window-minimize");
    minimize.setAttribute("aria-label", groupText("收起头像助手", "Minimize avatar helper"));
    minimize.title = groupText("收起，保留当前选择", "Minimize; keep your selection");
    minimize.addEventListener("click", () => panel.classList.remove("spga-open"));
    header.append(minimize, close);'''
assert source.count(old) == 1
source = source.replace(old, new)
styleAnchor = '      body:has(#${PANEL_ID}.spga-open) #${TOGGLE_ID} { visibility: hidden; }'
style = '''
      #${PANEL_ID} .spga-header { background:#edf2f7;gap:6px;padding:12px;cursor:grab; }
      #${PANEL_ID} .spga-header:active { cursor:grabbing; }
      #${PANEL_ID} .spga-title { font-size:15px;white-space:nowrap; }
      #${PANEL_ID} .spga-subtitle { display:none; }
      #${PANEL_ID} .spga-window-close { background:#c62828;color:#fff;border-color:#c62828; }
      #${PANEL_ID} .spga-window-close:hover { background:#a91e1e; }
      #${PANEL_ID} .spga-window-minimize { font-size:18px; }
      #${PANEL_ID} .spga-target-tabs { margin:12px 14px 0; }
'''
assert source.count(styleAnchor) == 1
source = source.replace(styleAnchor, styleAnchor + style)
assert all(word not in source for word in ['launchStickerMarket', 'MARKET_CATALOG', 'openMarketWorkspace', '市场', 'market'])
# Keep the original userscript install/update identity for existing users.
source = source.replace('SeaTalk GIF 助手（5.0 预览版）', 'SeaTalk 个人 GIF 头像助手')
source = source.replace('SeaTalk GIF Helper (5.0 Preview)', 'SeaTalk Personal GIF Avatar Helper')
source = source.replace('个人与群 GIF 头像、收藏预览筛选和批量管理。5.0 预览版。', '个人与群 GIF 头像、收藏表情批量管理、分享口令与自动分栏。')
source = source.replace('Personal and group GIF avatars, favorites previews, filtering and batch management. 5.0 preview.', 'Personal and group GIF avatars, batch favorites management, sharing codes and automatic split layout.')
source = source.replace('5.0 预览版：适配新版个人 GIF 头像，新增收藏表情批量管理。', '适配新版个人 GIF 头像，新增收藏表情批量管理与分享。')
source = source.replace('5.0 preview: updated personal GIF avatars and batch management for favorite stickers.', 'Updated personal GIF avatars, batch favorites management and sticker sharing.')
assert '5.0 预览版' not in source and '5.0 preview' not in source
assert '@version      ' + version in source
# Keep install/update metadata and stored identifiers compatible while renaming the product UI.
product_names = [
    ('SeaTalk GIF Avatar Helper', 'SeaTalk Sticker Helper'),
    ('SeaTalk GIF Helper', 'SeaTalk Sticker Helper'),
    ('SeaTalk GIF 助手', 'SeaTalk 表情助手'),
    ('我的收藏', '我的表情'),
    ('My favorites', 'My stickers'),
    ('Avatar helper', 'GIF avatars'),
    ('avatar helper', 'GIF avatars'),
    ('头像助手', 'GIF 头像'),
]
product_lines = []
for line in source.splitlines(keepends=True):
    if not line.startswith('// @name'):
        for old, new in product_names:
            line = line.replace(old, new)
    product_lines.append(line)
source = ''.join(product_lines)
# Show the product upgrade once for this release using the existing versioned notice.
import re
release_copy = {'updateTitle': ['升级为 SeaTalk 表情助手', 'Meet SeaTalk Sticker Helper'], 'updateSubtitle': ['整理、搜索、分享你的收藏表情，也能设置 GIF 头像。', 'Organize, search and share your favorite stickers, and set GIF avatars.'], 'updateHighlightOne': ['我的表情：备注、关键词搜索与独立筛选，快速找到想发的表情', 'My stickers: notes, keyword search and separate filters to find the right sticker'], 'updateHighlightTwo': ['预览单张或勾选多张，核对当前会话后确认发送', 'Preview one or select several, check the destination and confirm sending'], 'updateHighlightThree': ['分享口令携带名称和关键词；个人备份支持换电脑恢复', 'Share names and keywords with a code; back up personal settings for another computer'], 'updateHighlightFour': ['手动标注动图／静态图，中英文同步；个人与群 GIF 头像继续保留', 'Manual image-format labels and shared language settings; personal and group GIF avatars remain available']}
for key, values in release_copy.items():
    pattern = re.compile(r'(^      ' + key + r': )"[^\n]*",', re.M)
    matches = list(pattern.finditer(source))
    assert len(matches) == 2, key
    for match, value in reversed(list(zip(matches, values))):
        source = source[:match.start()] + match.group(1) + __import__('json').dumps(value, ensure_ascii=False) + ',' + source[match.end():]
source = source.replace('个人与群 GIF 头像、收藏表情批量管理、分享口令与自动分栏。', 'SeaTalk 表情助手：备注搜索、分享口令、备份恢复、确认后发送与 GIF 头像。')
source = source.replace('Personal and group GIF avatars, batch favorites management, sharing codes and automatic split layout.', 'SeaTalk Sticker Helper: searchable notes, sharing codes, backups, confirmed sending and GIF avatars.')

output.write_text(source)
print(output)

