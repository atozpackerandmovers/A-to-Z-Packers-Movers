'use strict';
function timestamp(value){
 if(typeof value!=='string'||!/^\d{10,12}\.\d{1,12}$/.test(value))throw Error('Invalid exact event timestamp');
 const [seconds,fraction]=value.split('.');return BigInt(seconds)*1000000000000n+BigInt(fraction.padEnd(12,'0'));
}
function validateActivation(value){
 if(!value||value.enabled!==true)return Object.freeze({enabled:false,notBefore:null});
 timestamp(value.notBefore);return Object.freeze({enabled:true,notBefore:value.notBefore});
}
function allowedEvent(value,eventTimestamp,now){
 if(value.enabled!==true)return false;
 try{return timestamp(eventTimestamp)>=timestamp(value.notBefore)&&timestamp(eventTimestamp)<=BigInt(Math.floor(now/1000)+60)*1000000000000n;}catch{return false;}
}
module.exports={timestamp,validateActivation,allowedEvent};
