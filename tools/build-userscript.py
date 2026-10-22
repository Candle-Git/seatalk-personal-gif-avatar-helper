"""Build the market-free formal userscript. Does not install or publish anything."""
from pathlib import Path
import subprocess
import sys
import argparse
import tempfile

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description='Build the formal SeaTalk GIF helper from reviewed local sources.')
parser.add_argument('--version', default='5.0.0')
parser.add_argument('--output', default='SeaTalk-Personal-GIF-Avatar-Helper.user.js')
args = parser.parse_args()
version = args.version
output = root / args.output
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
workspace = workspace.replace('  /* WORKSPACE_ACCOUNT */', (root / 'tools/workspace-account.js').read_text())
workspace = workspace.replace('  /* SHARE_HELPERS */', (root / 'tools/sticker-share.js').read_text())
workspace = workspace.replace('  /* WORKSPACE_TASKS */', (root / 'tools/favorites-tasks.js').read_text())
workspace = workspace.replace('  /* WORKSPACE_GEOMETRY */', (root / 'tools/favorites-geometry.js').read_text())
workspace = workspace.replace('  /* SHARE_UI */', (root / 'tools/sticker-share-ui.js').read_text())
split_source = (root / 'tools/helper-split-layout.js').read_text()
plan = split_source[:split_source.index('function installHelperLayout()')]
installer = split_source[split_source.index('function installHelperLayout()'):].replace('  /* SPLIT_PLAN */', plan)
source = source[:start] + workspace + '\n' + installer + source[end:]
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
output.write_text(source)
print(output)

