// Entirely synthesized ambience. Audio only starts after a deliberate user gesture.
import {validBirdState} from '../shared/bird.js';
export class Ambience {
  constructor({createContext=()=>{
    const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!AudioContext)throw new Error('Audio is unavailable in this browser.');
    return new AudioContext();
  },isHidden=()=>document.hidden}={}){
    this.enabled=false;this.context=null;this.transition=null;
    this.createContext=createContext;this.isHidden=isHidden;
    this.phraseNodes=new Set();this.lastPhraseId=null;
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
      this.hold();await this.context.suspend();this.enabled=false;return false;
    }
    if(!this.context){
      const ctx=this.context=this.createContext();this.master=ctx.createGain();this.master.gain.value=.09;this.master.connect(ctx.destination);
      const buffer=ctx.createBuffer(1,ctx.sampleRate*7,ctx.sampleRate);const data=buffer.getChannelData(0);let previous=0;
      for(let i=0;i<data.length;i++){previous=(previous+(Math.random()*2-1)*.025)/1.025;data[i]=previous*3;}
      const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;source.connect(filter);filter.connect(this.master);source.start();
    }
    await this.context.resume();this.enabled=true;if(this.isHidden())await this.context.suspend();return true;
  }
  update(light,rain,birdDisplay=null){
    this.light=light;
    this.syncBird(birdDisplay);
    if(!this.enabled||this.context?.state!=='running')return;
    const time=this.context.currentTime,target=.07+rain*.06;
    if(time-this.lastGainAt<.5||(this.gainTarget!==null&&Math.abs(target-this.gainTarget)<.001))return;
    const gain=this.master.gain,current=gain.value;
    // Retain the current audible value, but replace the automation history.
    // Only one starting value and one target remain, even after hours of rendering.
    gain.cancelScheduledValues(0);gain.setValueAtTime(current,time);gain.setTargetAtTime(target,time,2);
    this.lastGainAt=time;this.gainTarget=target;
  }
  hold(){
    for(const nodes of this.phraseNodes)this.releasePhrase(nodes,true);
  }
  releasePhrase(nodes,stop=false){
    if(!this.phraseNodes.delete(nodes))return;
    const {osc,gain}=nodes;osc.onended=null;
    if(stop){try{osc.stop();}catch{}}
    try{osc.disconnect();}catch{}
    try{gain.disconnect();}catch{}
  }
  syncBird(display){
    const action=display?.bird?.pending;
    if(!this.enabled||this.transition||this.context?.state!=='running'||this.isHidden()||!display?.active||
      !validBirdState(display.bird)||action?.kind!=='call'||!Number.isFinite(display.now)||
      !Number.isFinite(display.validUntil)||action.end>display.validUntil){this.hold();return;}
    if(action.id===this.lastPhraseId)return;
    this.hold();
    const delay=(action.phraseStart-display.now)/1000;
    if(delay<0){this.lastPhraseId=action.id;return;}
    if(delay>.25)return; // Small look-ahead; never queue minutes of sound.
    this.lastPhraseId=action.id;
    this.phrase(this.context.currentTime+delay);
  }
  phrase(time){
    const ctx=this.context;
    for(let i=0;i<3;i++){
      const start=time+i*.13,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';
      osc.frequency.setValueAtTime(2000+i*220,start);osc.frequency.exponentialRampToValueAtTime(3200-i*200,start+.07);osc.frequency.exponentialRampToValueAtTime(2400,start+.12);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.055,start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+.14);
      const nodes={osc,gain};this.phraseNodes.add(nodes);
      osc.onended=()=>this.releasePhrase(nodes);
      osc.connect(gain);gain.connect(this.master);osc.start(start);osc.stop(start+.16);
    }
  }
  async visibility(){this.hold();if(this.transition)await this.transition;if(!this.context||!this.enabled)return;if(this.isHidden())await this.context.suspend();else await this.context.resume();}
}
