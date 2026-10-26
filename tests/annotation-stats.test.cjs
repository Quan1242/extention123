const {test}=require('node:test');
const assert=require('node:assert/strict');
const {countCuboidsById}=require('../extension/annotation_stats.js');

test('counts visible and outside frames across interpolated track ranges',()=>{
 const rows=countCuboidsById({
  labels_manifest:[{id:7,name:'vehicles'},{id:8,name:'pedestrian'}],
  tracks:[
   {clientID:12,id:120,label_id:7,shapes:[
     {type:'cuboid',frame:0,outside:false},
     {type:'cuboid',frame:2,outside:true},
     {type:'cuboid',frame:4,outside:false},
     {type:'rectangle',frame:5,outside:false},
    ]},
    {clientID:4,id:40,label_id:8,shapes:[{type:'cuboid',frame:2,outside:false}]},
  ],
  shapes:[{clientID:12,id:121,label_id:7,type:'cuboid',frame:1,outside:true}],
 },0,5);
 assert.deepEqual(rows,[
  {clientID:4,serverID:40,label:'pedestrian',cuboids:4,outside:0},
  {clientID:12,serverID:120,label:'vehicles',cuboids:4,outside:3},
 ]);
});

test('rejects annotation rows without a display ID rather than merging them',()=>{
 assert.throws(()=>countCuboidsById({shapes:[{type:'cuboid',frame:0}]},0,1),/clientID/);
});

test('clips track counts to job frames and omits standalone shapes outside that range',()=>{
 const rows=countCuboidsById({
  tracks:[{clientID:3,id:30,shapes:[{type:'cuboid',frame:0},{type:'cuboid',frame:5,outside:true}]}],
  shapes:[{clientID:4,id:40,type:'cuboid',frame:8}],
 },2,6);
 assert.deepEqual(rows,[
  {clientID:3,serverID:30,label:'Unknown',cuboids:3,outside:2},
 ]);
});
