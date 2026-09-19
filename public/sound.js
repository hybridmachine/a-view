// Entirely synthesized ambience. Audio only starts after a deliberate user gesture.
export class Ambience {
  constructor({createContext=()=>{
    const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!AudioContext)throw new Error('Audio is unavailable in this browser.');
    return new AudioContext();
  },schedule=(callback,delay)=>globalThis.setInterval(callback,delay),cancel=timer=>globalThis.clearInterval(timer),isHidden=()=>document.hidden}={}){
    this.enabled=false;this.context=null;this.birdTimer=null;this.transition=null;
    this.createContext=createContext;this.schedule=schedule;this.cancel=cancel;this.isHidden=isHidden;
    this.lastGainAt=-Infinity;this.gainTarget=null;
  }
  toggle(){
    if(this.transition)return this.transition;
    // Coalesce repeated clicks while the browser is resuming or suspending audio.
    this.transition=this.applyToggle().finally(()=>{this.transition=null;});
    return this.transition;
  }
  async applyToggle(){
    if(this.enabled){
      await this.context.suspend();this.enabled=false;
      this.cancel(this.birdTimer);this.birdTimer=null;return false;
    }
    if(!this.context){
      const ctx=this.context=this.createContext();this.master=ctx.createGain();this.master.gain.value=.09;this.master.connect(ctx.destination);
      const buffer=ctx.createBuffer(1,ctx.sampleRate*7,ctx.sampleRate);const data=buffer.getChannelData(0);let previous=0;
      for(let i=0;i<data.length;i++){previous=(previous+(Math.random()*2-1)*.025)/1.025;data[i]=previous*3;}
      const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;source.connect(filter);filter.connect(this.master);source.start();
    }
    await this.context.resume();this.enabled=true;this.birdTimer=this.schedule(()=>this.chirp(),8000);return true;
  }
  update(light,rain){
    this.light=light;
    if(!this.enabled||this.context?.state!=='running')return;
    const time=this.context.currentTime,target=.07+rain*.06;
    if(time-this.lastGainAt<.5||(this.gainTarget!==null&&Math.abs(target-this.gainTarget)<.001))return;
    const gain=this.master.gain,current=gain.value;
    // Retain the current audible value, but replace the automation history.
    // Only one starting value and one target remain, even after hours of rendering.
    gain.cancelScheduledValues(0);gain.setValueAtTime(current,time);gain.setTargetAtTime(target,time,2);
    this.lastGainAt=time;this.gainTarget=target;
  }
  chirp(){
    if(!this.enabled||this.isHidden()||(this.light??1)<.4)return;
    const ctx=this.context,time=ctx.currentTime;
    for(let i=0;i<3;i++){
      const start=time+i*.13,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';
      osc.frequency.setValueAtTime(2000+i*220,start);osc.frequency.exponentialRampToValueAtTime(3200-i*200,start+.07);osc.frequency.exponentialRampToValueAtTime(2400,start+.12);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.055,start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+.14);
      osc.connect(gain);gain.connect(this.master);osc.start(start);osc.stop(start+.16);
    }
  }
  async visibility(){if(this.transition)await this.transition;if(!this.context||!this.enabled)return;if(this.isHidden())await this.context.suspend();else await this.context.resume();}
}
