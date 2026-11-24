// Only fixed artwork from this table is inserted into either panel.
const stickerIconPaths = {
  groups: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m6-18v18M3 9h18M3 15h18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  'sort-desc': '<path d="M7 4v16m-4-4 4 4 4-4M13 6h8m-8 5h6m-6 5h4"/>',
  'sort-asc': '<path d="M7 20V4M3 8l4-4 4 4m2 10h8m-8-5h6m-6-5h4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  collect: '<path d="M14 4H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2v3l4-3h5a2 2 0 0 0 2-2v-4m0-10v7m-3.5-3.5h7"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  minimize: '<path d="M5 12h14"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-.9.7-1.7 1.2-1.7 2.7m0 3h.01"/>',
  settings: '<path d="m9.2 4 .5-2h4.6l.5 2 1.6.9 2-.6 2.3 4-1.5 1.5v2.4l1.5 1.5-2.3 4-2-.6-1.6.9-.5 2H9.7l-.5-2-1.6-.9-2 .6-2.3-4 1.5-1.5V9.8L3.3 8.3l2.3-4 2 .6z"/><circle cx="12" cy="11" r="3"/>',
  sliders: '<path d="M3 7h4m5 0h9M3 17h10m5 0h3"/><circle cx="9.5" cy="7" r="2.5"/><circle cx="15.5" cy="17" r="2.5"/>',
  first: '<path d="M5 5v14m12-14-7 7 7 7"/>',
  prev: '<path d="m15 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  last: '<path d="M19 5v14M7 5l7 7-7 7"/>',
  enter: '<path d="M20 5v9H4m5-5-5 5 5 5"/>',
  clear: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
  organize: '<path d="M3 7V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M8 12h8m-8 4h5"/>',
  edit: '<path d="M13 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6m-1-10 3 3L11 16l-4 1 1-4z"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M7.5 10.5h6m-3-3v6"/>',
  selected: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
  send: '<path d="m21 3-6 18-4-8-8-4 18-6Zm0 0L11 13"/>',
  share: '<path d="M12 15V3m-4 4 4-4 4 4M6 10H4v10h16V10h-2"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
};
function stickerIcon(name) {
  return '<svg class="st-icon" aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + stickerIconPaths[name] + '</svg>';
}
