import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFoliageExport} from '../scripts/foliage-asset-validation.mjs';

function fixture(){
  return {width:2,height:1,config:{atlasSize:[1,1],patches:[{bounds:[0,0,1,1],rect:[0,0,1,1]}]},
    sources:[Buffer.from([100,120,140,128,20,30,40,255]),Buffer.from([10,12,14,128,2,3,4,255])],
    bases:[Buffer.from([0,0,0,0,20,30,40,255]),Buffer.from([0,0,0,0,2,3,4,255])],
    atlases:[Buffer.from([100,120,140,128]),Buffer.from([10,12,14,128])]};
}
test('both lighting plates reconstruct partial coverage and untouched pixels',()=>{
  const input=fixture(),result=verifyFoliageExport(input);
  for(let i=0;i<2;i++){assert.deepEqual(result[i].rest,input.sources[i]);assert.equal(result[i].maxError,0);assert.equal(result[i].maxAlphaError,0);}
});
test('export rejects mismatched input, repaired-base, or atlas alpha',()=>{
  for(const key of ['sources','bases','atlases']){
    const input=fixture();input[key][1][3]++;
    assert.throws(()=>verifyFoliageExport(input),/coverage mismatch/);
  }
});
test('night-only paint damage is caught even when the day reconstruction is exact',()=>{
  const input=fixture();input.atlases[1][0]=90;
  assert.throws(()=>verifyFoliageExport(input),/Night rest reconstruction/);
});
test('export checks unchanged pixels, alpha reconstruction, and RGBA dimensions',()=>{
  const outside=fixture();outside.bases[1][4]=99;assert.throws(()=>verifyFoliageExport(outside),/Night rest reconstruction/);
  const alpha=fixture();for(const atlas of alpha.atlases)atlas[3]=100;assert.throws(()=>verifyFoliageExport(alpha),/rest reconstruction/);
  const dimensions=fixture();dimensions.bases[0]=Buffer.alloc(4);assert.throws(()=>verifyFoliageExport(dimensions),/invalid RGBA dimensions/);
});
