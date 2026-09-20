import {LAKESIDE_BIRD,validBirdArt} from '/shared/lakeside-bird.js';

// Reuses the original hand-drawn silhouette. A small subject-only canvas lets
// fixed bark occlude the bird without covering any independently moving layer.
export class BirdRenderer {
  constructor(art=LAKESIDE_BIRD){
    this.valid=validBirdArt(art);this.art=art;
    this.canvas=document.createElement('canvas');this.canvas.width=this.canvas.height=96;
    this.ctx=this.canvas.getContext('2d');
    this.valid=this.valid&&!!this.ctx;
  }
  draw(target,pose,light,point,scale,{motion=true}={}){
    if(!this.valid||!pose||pose.hidden)return false;
    const ctx=this.ctx,art=this.art;
    ctx.clearRect(0,0,96,96);ctx.save();ctx.translate(48,48);
    ctx.save();ctx.scale(pose.scale*pose.direction,pose.scale);ctx.globalAlpha=.55+.35*light;
    ctx.fillStyle='#4a4b3b';ctx.beginPath();ctx.ellipse(0,-2,5.3,3.1,-.1,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#736750';ctx.beginPath();ctx.ellipse(1,-1.4,3.6,2.3,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#393e32';ctx.beginPath();ctx.arc(4,-4,2.6,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(5,-4.3);ctx.lineTo(8,-3.5);ctx.lineTo(5,-2.9);ctx.fill();
    ctx.beginPath();ctx.moveTo(-4,-2);ctx.lineTo(-10,-5);ctx.lineTo(-8,0);ctx.closePath();ctx.fill();
    if(pose.flying&&motion){
      const flap=Math.sin(pose.wingPhase);ctx.fillStyle='#4b5041';ctx.beginPath();ctx.moveTo(-2,-3);ctx.quadraticCurveTo(-5,-8-flap*6,2,-12-flap*5);ctx.lineTo(4,-4);ctx.closePath();ctx.fill();
      ctx.globalAlpha*=.65;ctx.beginPath();ctx.moveTo(-1,-2);ctx.quadraticCurveTo(0,2+flap*7,6,5+flap*7);ctx.lineTo(3,-2);ctx.fill();
    }else{
      ctx.strokeStyle='#62573f';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(0,1);ctx.lineTo(0,4);ctx.moveTo(3,1);ctx.lineTo(2,4);ctx.stroke();
    }
    ctx.fillStyle='#d9d5b7';ctx.beginPath();ctx.arc(5,-4.6,.6,0,Math.PI*2);ctx.fill();
    if(pose.carrying){ctx.strokeStyle='#a88e63';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(7,-4);ctx.lineTo(13,1);ctx.stroke();}
    ctx.restore();
    if(!pose.legacy){
      ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';ctx.beginPath();
      art.occluder.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](x-pose.x*art.width,y-pose.y*art.height));ctx.closePath();ctx.fill();
    }
    ctx.restore();const [x,y]=point(pose.x,pose.y);
    target.drawImage(this.canvas,x-48*scale,y-48*scale,96*scale,96*scale);
    return true;
  }
}
