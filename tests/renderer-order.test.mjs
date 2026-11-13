import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../lab/vendor/cubism4.js',import.meta.url),'utf8');
function method(name,next){const a=source.indexOf('    '+name+'() {')+('    '+name+'() {').length,b=source.indexOf('\n    '+next+'(',a);return new Function(source.slice(a,b).replace(/\n    }\s*$/,''));}
const order=method('getDrawableRenderOrders','getDrawableTextureIndices');
const legacy={drawables:{count:3,renderOrders:new Int32Array([2,0,1]),drawOrders:new Int32Array([500,500,1000])}};
assert.deepEqual([...order.call({_model:legacy})],[2,0,1]);
const modern={drawables:{count:3,drawOrders:new Int32Array([500,500,1000])},offscreens:{count:0},renderOrders:new Int32Array([2,0,1])};
assert.deepEqual([...order.call({_model:modern})],[2,0,1]);
modern.getRenderOrders=()=>new Int32Array([1,2,0]);assert.deepEqual([...order.call({_model:modern})],[1,2,0]);
assert.throws(()=>order.call({_model:{drawables:{count:3,drawOrders:[500,500,1000]}}}),/CORE_API_MISMATCH/);
assert.throws(()=>order.call({_model:{drawables:{count:3,renderOrders:[0,1]}}}),/CORE_API_MISMATCH/);
modern.offscreens.count=1;assert.throws(()=>order.call({_model:modern}),/RENDERER_FEATURE_UNSUPPORTED/);
console.log('PASS actual renderer getter: legacy dense ordering, R5 Model ordering, rejects raw author drawOrders and unsupported offscreens');
