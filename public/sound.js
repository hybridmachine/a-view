// Entirely synthesized ambience. Audio only starts after a deliberate user gesture.
export class Ambience {
  constructor(){this.enabled=false;this.context=null;this.birdTimer=null;}
  async toggle(){
    if(this.enabled){this.enabled=false;clearInterval(this.birdTimer);if(this.context)await this.context.suspend();return false;}
    const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)throw new Error('Audio is unavailable in this browser.');
    if(!this.context){
      const ctx=this.context=new AudioContext();this.master=ctx.createGain();this.master.gain.value=.09;this.master.connect(ctx.destination);
      const buffer=ctx.createBuffer(1,ctx.sampleRate*7,ctx.sampleRate);const data=buffer.getChannelData(0);let previous=0;
      for(let i=0;i<data.length;i++){previous=(previous+(Math.random()*2-1)*.025)/1.025;data[i]=previous*3;}
      const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;source.connect(filter);filter.connect(this.master);source.start();
    }
    await this.context.resume();this.enabled=true;this.birdTimer=setInterval(()=>this.chirp(),8000);return true;
  }
  update(light,rain){this.light=light;if(this.master)this.master.gain.setTargetAtTime(.07+rain*.06,this.context.currentTime,2);}
  chirp(){
    if(!this.enabled||document.hidden||(this.light??1)<.4)return;
    const ctx=this.context,time=ctx.currentTime;
    for(let i=0;i<3;i++){
      const start=time+i*.13,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';
      osc.frequency.setValueAtTime(2000+i*220,start);osc.frequency.exponentialRampToValueAtTime(3200-i*200,start+.07);osc.frequency.exponentialRampToValueAtTime(2400,start+.12);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.055,start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+.14);
      osc.connect(gain);gain.connect(this.master);osc.start(start);osc.stop(start+.16);
    }
  }
  async visibility(){if(!this.context||!this.enabled)return;if(document.hidden)await this.context.suspend();else await this.context.resume();}
}
