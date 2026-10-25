// Exact coastline checks (point in island, nearest shore, distance) for stamp stops, collision and tests; no rendering or DOM.
export function pointInIsland(island,x,z){
  const {points,count}=island;let inside=false;
  for(let i=0,j=count-1;i<count;j=i++){
    const ax=points[i*2],az=points[i*2+1],bx=points[j*2],bz=points[j*2+1];
    if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;
  }
  return inside;
}
export function pointSegmentDistanceSquared(px,pz,ax,az,bx,bz){
  const dx=bx-ax,dz=bz-az,len=dx*dx+dz*dz,t=len?Math.max(0,Math.min(1,((px-ax)*dx+(pz-az)*dz)/len)):0;
  return (px-ax-dx*t)**2+(pz-az-dz*t)**2;
}
export function segmentDistanceSquared(a,b,c,d){
  const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  if(abC*abD<0&&cdA*cdB<0)return 0;
  return Math.min(pointSegmentDistanceSquared(a.x,a.z,c.x,c.z,d.x,d.z),pointSegmentDistanceSquared(b.x,b.z,c.x,c.z,d.x,d.z),pointSegmentDistanceSquared(c.x,c.z,a.x,a.z,b.x,b.z),pointSegmentDistanceSquared(d.x,d.z,a.x,a.z,b.x,b.z));
}
export function createCoastQuery(islands,kmPerWorldUnitAt,lockedCountries=[]){
  const isLand=(x,z)=>islands.some(i=>x>=i.minX&&x<=i.maxX&&z>=i.minZ&&z<=i.maxZ&&pointInIsland(i,x,z));
  function nearest(x,z){
    let best=Infinity,result={x,z};
    for(const island of islands){
      const dx=Math.max(island.minX-x,0,x-island.maxX),dz=Math.max(island.minZ-z,0,z-island.maxZ);
      if(dx*dx+dz*dz>=best)continue;
      const {points,count}=island;
      for(let k=0;k<count;k++){
        const n=(k+1)%count,ax=points[k*2],az=points[k*2+1],bx=points[n*2],bz=points[n*2+1];
        const dx=bx-ax,dz=bz-az,len=dx*dx+dz*dz,t=len?Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/len)):0;
        const nx=ax+t*dx,nz=az+t*dz,d=(nx-x)**2+(nz-z)**2;
        if(d<best){best=d;result={x:nx,z:nz};}
      }
    }
    return result;
  }
  const seaBoundaryCache=new Map();
  function nearestSea(x,z){
    const key=`${x},${z}`;if(seaBoundaryCache.has(key))return seaBoundaryCache.get(key);
    const near=nearest(x,z),probe=5.8/kmPerWorldUnitAt(near.z);
    if(Array.from({length:12},(_,i)=>i*Math.PI/6).some(a=>distance(near.x+Math.cos(a)*probe,near.z+Math.sin(a)*probe)>=2.2)){seaBoundaryCache.set(key,near);return near;}
    const candidates=[];
    for(const island of islands)for(let k=0;k<island.count;k++){
      const n=(k+1)%island.count,ax=island.points[k*2],az=island.points[k*2+1],dx=island.points[n*2]-ax,dz=island.points[n*2+1]-az;
      const len=dx*dx+dz*dz;if(!len)continue;
      const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/len));
      const px=ax+dx*t,pz=az+dz*t,unit=(5.8/kmPerWorldUnitAt(pz))/Math.sqrt(len);
      candidates.push({x:px,z:pz,dx:-dz*unit,dz:dx*unit,d:(px-x)**2+(pz-z)**2});
    }
    candidates.sort((a,b)=>a.d-b.d);
    const p=candidates.find(p=>distance(p.x+p.dx,p.z+p.dz)>=2.2||distance(p.x-p.dx,p.z-p.dz)>=2.2);
    const result=p?{x:p.x,z:p.z}:nearest(x,z);seaBoundaryCache.set(key,result);return result;
  }
  const distance=(x,z)=>{if(!islands.length)return Infinity;if(isLand(x,z))return 0;const p=nearest(x,z);return Math.hypot(p.x-x,p.z-z)*kmPerWorldUnitAt(z);};
  function segmentClear(a,b,clearanceKm=2.1,obstacles=[]){
    if(isLand(a.x,a.z)||isLand(b.x,b.z))return false;
    const units=Math.min(kmPerWorldUnitAt(a.z),kmPerWorldUnitAt(b.z));
    const radius=Math.max(clearanceKm,lockedCountries.length?12:0)/units;
    const minX=Math.min(a.x,b.x)-radius,maxX=Math.max(a.x,b.x)+radius,minZ=Math.min(a.z,b.z)-radius,maxZ=Math.max(a.z,b.z)+radius;
    for(const island of islands){
      const localRadius=Math.max(clearanceKm,lockedCountries.includes(island.country)?12:0)/units,r2=localRadius*localRadius;
      if(island.minX>maxX||island.maxX<minX||island.minZ>maxZ||island.maxZ<minZ)continue;
      for(let k=0;k<island.count;k++){
        const next=(k+1)%island.count,c={x:island.points[k*2],z:island.points[k*2+1]},d={x:island.points[next*2],z:island.points[next*2+1]};
        if(Math.min(c.x,d.x)>maxX||Math.max(c.x,d.x)<minX||Math.min(c.z,d.z)>maxZ||Math.max(c.z,d.z)<minZ)continue;
        if(segmentDistanceSquared(a,b,c,d)<=Math.max(r2,1e-16))return false;
      }
    }
    for(const o of obstacles){
      if(o.minX!==undefined){
        if([a,b].some(p=>p.x>=o.minX&&p.x<=o.maxX&&p.z>=o.minZ&&p.z<=o.maxZ))return false;
        const corners=[{x:o.minX,z:o.minZ},{x:o.maxX,z:o.minZ},{x:o.maxX,z:o.maxZ},{x:o.minX,z:o.maxZ}];
        if(corners.some((c,i)=>segmentDistanceSquared(a,b,c,corners[(i+1)%4])<1e-12))return false;
      }else if(pointSegmentDistanceSquared(o.x,o.z,a.x,a.z,b.x,b.z)<(o.radius??.65)**2)return false;
    }
    return true;
  }
  return {isLand,nearest,nearestSea,distance,segmentClear};
}
