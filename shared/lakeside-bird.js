// Anchors and Bezier controls are native 1672 x 941 painting pixels.
// Body origins sit four bird pixels above the feet. The oak anchors are fixed
// wood, outside every moving foliage patch; shelter passes behind the trunk.
const locations={
  nest:{point:[.234*1672,(.245-.005)*941],scale:1,direction:-1},
  'oak-perch':{point:[310,232],scale:1,direction:1},
  'oak-shelter':{point:[219,343],scale:1,direction:-1},
  'roof-perch':{point:[548,394],scale:.76,direction:-1},
};
const routes={};
function pair(from,to,controls,durationMs){
  const points=[locations[from].point,...controls,locations[to].point];
  routes[`${from}:${to}`]={from,to,points,durationMs};
  routes[`${to}:${from}`]={from:to,to:from,points:[...points].reverse(),durationMs};
}
pair('nest','oak-perch',[[369,206],[328,205]],4000);
pair('oak-perch','oak-shelter',[[321,275],[279,316]],6000);
pair('oak-perch','roof-perch',[[365,261],[491,306]],9000);
export const LAKESIDE_BIRD={
  version:1,width:1672,height:941,locations,routes,
  // Right contour of fixed bark. Used to erase only the subject, never scenery.
  occluder:[[253,279],[247,301],[240,321],[232,344],[222,374],[180,400],[145,400],[145,279]],
};

export function validBirdArt(art){
  const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
  return !!art&&art.version===1&&art.width===1672&&art.height===941&&
    Object.entries(locations).every(([id,location])=>{
      const p=art.locations?.[id];return point(p?.point)&&p.point.every((v,i)=>v===location.point[i])&&p.scale===location.scale&&p.direction===location.direction;
    })&&Object.entries(routes).every(([id,route])=>{
      const r=art.routes?.[id];return r?.from===route.from&&r?.to===route.to&&r?.durationMs===route.durationMs&&
        r.points?.length===4&&r.points.every((p,i)=>point(p)&&p.every((v,j)=>v===route.points[i][j]));
    })&&art.occluder?.length===8&&art.occluder.every((p,i)=>point(p)&&p.every((v,j)=>v===LAKESIDE_BIRD.occluder[i][j]));
}
