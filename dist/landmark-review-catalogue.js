export const REVIEW_COUNTRIES=['台灣','日本','韓國','北韓','菲律賓','香港','澳門','越南','汶萊','馬來西亞','印尼','新加坡'];
const countryCode={'台灣':'tw','日本':'jp','韓國':'kr','北韓':'nk','菲律賓':'ph','香港':'hk','澳門':'mo','越南':'vn','汶萊':'bn','馬來西亞':'my','印尼':'id','新加坡':'sg'};
export function buildReviewCatalogue(landmarks,references){
  const counts=new Map();for(const item of landmarks)counts.set(item.type,(counts.get(item.type)??0)+1);
  return REVIEW_COUNTRIES.flatMap(country=>landmarks.filter(item=>item.country===country).map(item=>{
    const reference=references.find(ref=>ref.name===item.name);
    return {...item,...reference,country,
      id:reference?.id??(reference?reference.type:counts.get(item.type)>1?`${countryCode[country]}-${item.type}`:item.type),
      options:{...item.options,...reference?.options},
      features:reference?.features??item.intro??'',sources:reference?.sources??[],
      hasReference:!!reference};
  }));
}
export function filterReviewCatalogue(items,{country='',query=''}={}){
  const needle=query.trim().toLocaleLowerCase();
  return items.filter(item=>(!country||item.country===country)&&(!needle||[item.name,item.country,item.id,...item.aliases??[]].some(text=>text.toLocaleLowerCase().includes(needle))));
}
