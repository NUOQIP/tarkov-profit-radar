import {MARKETS,CATEGORIES,normalizeProfile,migrateScavengingCategories,SCAVENGING_SELECTION_VERSION} from './model.mjs';
import {migrateWorkspaceViews} from './navigation.mjs';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const ids=value=>[...new Set((Array.isArray(value)?value:[]).filter(x=>typeof x==='string'&&/^[a-f0-9]{24}$/.test(x)))].slice(0,10000);
const boundedMap=value=>Object.fromEntries(Object.entries(object(value)).slice(0,200));
function view(value){
  const v=object(value),c=object(v.criteria),number=x=>Number.isFinite(Number(x))?Math.min(1e10,Math.max(0,Number(x))):0;
  return {category:Object.hasOwn(CATEGORIES,v.category)?v.category:'all',filter:['short','favorites'].includes(v.filter)?v.filter:'all',search:'',
    includeEvents:v.includeEvents===true,ignoreFleaLevel:v.ignoreFleaLevel!==false,
    quicklookView:v.quicklookView==='list'?'list':'cloud',station:typeof v.station==='string'&&/^[a-z0-9-]{1,64}$/i.test(v.station)?v.station:'all',
    quicklookTypes:migrateScavengingCategories(v.quicklookTypes,v.quicklookTypesRevision),quicklookTypesRevision:SCAVENGING_SELECTION_VERSION,
    criteria:{minSlot:number(c.minSlot),minProfit:number(c.minProfit),budget:number(c.budget),maxHours:number(c.maxHours),onlyExecutable:c.onlyExecutable===true}};
}
// Only player preferences may cross devices. Navigation, searches and credentials never do.
export function normalizeAccountSettings(input){
  const source=object(input),result={version:1,profiles:{},favorites:{},views:{},workspaceViews:{},theme:source.theme==='light'?'light':'dark',density:source.density==='compact'?'compact':'standard'};
  for(const market of Object.keys(MARKETS)){
    const p=object(source.profiles?.[market]);
    result.profiles[market]=normalizeProfile({...p,edition:'',completedTasks:ids(p.completedTasks),excludedStations:(Array.isArray(p.excludedStations)?p.excludedStations:[]).slice(0,200),
      traderLevels:boundedMap(p.traderLevels),stationLevels:boundedMap(p.stationLevels),stationFuel:{}});
    result.favorites[market]=ids(source.favorites?.[market]);result.views[market]=view(source.views?.[market]);
    result.workspaceViews[market]=Object.fromEntries(Object.entries(migrateWorkspaceViews(source,market)).map(([page,v])=>[page,{...view(v),includeEvents:result.views[market].includeEvents}]));
  }
  return result;
}
