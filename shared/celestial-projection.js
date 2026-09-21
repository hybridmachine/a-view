import { DEG, dot, cross, normalize, horizontalDirection } from './celestial.js';

// Camera describes the full artwork, before viewport crop/pan. The ridge lies
// above the astronomical horizon. Values are radians except normalized centerY.
export const SKY_CAMERA = Object.freeze({bearing:90*DEG,pitch:0,horizontalFov:100*DEG,centerY:.43});
export function cameraFrame(camera=SKY_CAMERA,width=1672,height=941) {
  const forward=horizontalDirection(camera.bearing,camera.pitch);
  const right=[Math.cos(camera.bearing),-Math.sin(camera.bearing),0],up=cross(right,forward);
  const focal=width/(2*Math.tan(camera.horizontalFov/2));
  return {forward,right,up,focal,width,height,centerY:camera.centerY};
}
export function projectDirection(direction, frame) {
  const depth=dot(direction,frame.forward);
  // All drawable rays in this <=120-degree camera are well in front of this
  // plane. Avoid unbounded coordinates for invisible near/behind-camera rays.
  if(depth<=.05)return {x:0,y:0,depth,inFront:false};
  return {x:.5+frame.focal/frame.width*dot(direction,frame.right)/depth,
    y:frame.centerY-frame.focal/frame.height*dot(direction,frame.up)/depth,depth,inFront:true};
}
export function intersectsView(body,crop=[1,1],offset=[0,0],halo=1) {
  return body.inFront&&body.x+body.extentX*halo>=offset[0]&&body.x-body.extentX*halo<=offset[0]+crop[0]&&
    body.y+body.extentY*halo>=offset[1]&&body.y-body.extentY*halo<=offset[1]+crop[1];
}
export function projectBody(body,frame,sizeScale=1,sunDirection=null) {
  const direction=body.apparentDirection??body.direction, point=projectDirection(direction,frame);
  if(!point.inFront)return {...body,...point,matrix:[0,0,0,0],extentX:0,extentY:0,radius:0,visible:false,light:[0,0,0]};
  const along=dot(direction,frame.right);
  const east=normalize(frame.right.map((x,i)=>x-direction[i]*along)),up=cross(east,direction);
  const radius=Math.tan(body.angularDiameter*sizeScale/2),depth=Math.max(.05,point.depth);
  // Tangent-plane Jacobian keeps angular disks/phase orientation consistent
  // toward the edges of a perspective view (small disks become ellipses).
  function derivative(tangent) {
    return [frame.focal*radius*(dot(tangent,frame.right)*depth-dot(direction,frame.right)*dot(tangent,frame.forward))/(depth*depth),
      -frame.focal*radius*(dot(tangent,frame.up)*depth-dot(direction,frame.up)*dot(tangent,frame.forward))/(depth*depth)];
  }
  const a=derivative(east),b=derivative(up.map(x=>-x));
  const matrix=[a[0],a[1],b[0],b[1]],extentX=Math.hypot(a[0],b[0])/frame.width,extentY=Math.hypot(a[1],b[1])/frame.height;
  const result={...body,...point,matrix,extentX,extentY,radius:Math.sqrt(Math.abs(a[0]*b[1]-a[1]*b[0]))};
  if(sunDirection)result.light=[dot(sunDirection,east),-dot(sunDirection,up),-dot(sunDirection,body.direction)];
  result.visible=intersectsView(result,[1,1],[0,0],6);
  return result;
}
