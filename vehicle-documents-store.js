/* Firebase adapters are supplied by the existing signed-in host. No rule changes. */
(function(root){
'use strict';
function create(api){
 const {db,collectionName,doc,runTransaction,serverTimestamp,storage,storageRef,uploadBytes,getDownloadURL,allowed,actor}=api;
 return {
 async save(data,pages,requestId){
  const access=allowed(),who=actor();
  root.AZPVehicleDocs.validate(data,pages,access.vehicles,access.drivers);
  if(!who)throw Error('Please sign in again.');
  const id='VEHICLE_DOC_'+requestId.replace(/[^a-zA-Z0-9_-]/g,''),ref=doc(db,collectionName,id),savedPages=[];
  const alreadySaved=await runTransaction(db,async tx=>(await tx.get(ref)).exists());
  if(alreadySaved)return id; // Do not replace bytes behind an already reviewed record.

  for(let i=0;i<pages.length;i++){
   const p=pages[i],path=`vehicleDocuments/${root.AZPVehicleDocs.key(data.vehicle_number||data.driver_name)}/${id}/${i}.${p.blob.type==='application/pdf'?'pdf':p.blob.type==='image/png'?'png':p.blob.type==='image/webp'?'webp':'jpg'}`;
   const fileRef=storageRef(storage,path);await uploadBytes(fileRef,p.blob,{contentType:p.blob.type});
   savedPages.push({name:p.name.trim()||'Page '+(i+1),type:p.blob.type,size:p.blob.size,path,url:await getDownloadURL(fileRef)});
  }
  // Recheck assignment after slow uploads. A retry never resets an office review.
  const current=allowed();root.AZPVehicleDocs.validate(data,pages,current.vehicles,current.drivers);
  if(actor()!==who)throw Error('Login changed. Please sign in again before saving.');
  await runTransaction(db,async tx=>{const existing=await tx.get(ref);if(existing.exists())return;tx.set(ref,{...data,module:'documents',collection:'documents',record_type:'vehicleDocumentV1',schema_version:1,pages:savedPages,verification_status:'Pending',uploaded_by:who,created_ms:Date.now(),createdAt:serverTimestamp(),updatedAt:serverTimestamp()});});
  return id;
 },
 async review(id,status){
  if(!api.isAdmin()||!['Verified','Rejected'].includes(status))throw Error('Office review required.');
  const who=actor();if(!who)throw Error('Please sign in again.');
  await runTransaction(db,async tx=>{const ref=doc(db,collectionName,id),snap=await tx.get(ref);if(!snap.exists()||snap.data().record_type!=='vehicleDocumentV1')throw Error('Document not found.');tx.update(ref,{verification_status:status,reviewed_by:who,reviewed_ms:Date.now(),updatedAt:serverTimestamp()});});
 }
 };
}
root.AZPVehicleDocsStore={create};
if(typeof module!=='undefined')module.exports=root.AZPVehicleDocsStore;
})(typeof window==='undefined'?globalThis:window);
