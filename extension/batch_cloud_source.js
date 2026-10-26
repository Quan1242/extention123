import { PCDLoader } from 'three/addons/loaders/PCDLoader.js';
window.__C3D_PARSE_PCD = buffer => {
 const cloud=new PCDLoader().parse(buffer),data=cloud.geometry.attributes.position.array;
 cloud.geometry.dispose();cloud.material.dispose();
 return data;
};
