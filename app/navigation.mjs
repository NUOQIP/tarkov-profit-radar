export const PAGES = ['items','run','flips','crafts'];
export const moduleForPage = page => page === 'items' || page === 'run' ? 'loot' : page;

export function resolvePage(requested, saved, market) {
  const page = requested || saved.page;
  if (PAGES.includes(page)) return page;
  if (page === 'loot' && saved.workspaceViews?.[market]?.loot?.lootScope === 'scavenging') return 'run';
  return 'items';
}

// Split the old shared workspace without carrying invisible range constraints forward.
export function migrateWorkspaceViews(saved, market) {
  const source = saved.workspaceViews?.[market] || {};
  const old = source.loot || saved.views?.[market] || {};
  const wasRun = old.lootScope === 'scavenging';
  const resetSearch = {search:'',filter:'all',category:'all',criteria:{}};
  const raw = {
    items:source.items || {...old,...(wasRun ? resetSearch : {})},
    run:source.run || {...old,...(!wasRun ? resetSearch : {}),category:'all'},
    flips:source.flips || {}, crafts:source.crafts || {}
  };
  return Object.fromEntries(PAGES.map(page => {
    const {lootScope,quicklookRange,...view} = raw[page] || {};
    return [page,{...view,...(page==='run'&&view.filter==='short'?{filter:'all'}:{}),criteria:{...view.criteria,...(page === 'run' ? {minSlot:0} : {})}}];
  }));
}
