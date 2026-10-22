export const PAGES = ['items','run','flips','crafts'];
export const moduleForPage = page => page === 'items' || page === 'run' ? 'loot' : page;
export const supportsSurgeFilter = page => page === 'items';
export const QUICKLOOK_PRESETS=Object.freeze({keys:{types:['keys']},mods:{types:['mods']},ammo:{types:['ammoBox']}});
export const activeRunTypes=view=>QUICKLOOK_PRESETS[view.quicklookPreset]?.types||view.quicklookTypes;
export const toggleRunPreset=(view,key)=>Object.hasOwn(QUICKLOOK_PRESETS,key)?{...view,quicklookPreset:view.quicklookPreset===key?null:key}:view;

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
    return [page,{...view,...(!supportsSurgeFilter(page)&&view.filter==='short'?{filter:'all'}:{}),criteria:{...view.criteria,...(page === 'run' ? {minSlot:0} : {})}}];
  }));
}
