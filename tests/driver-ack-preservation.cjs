const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base='d238760',project='integrations/driver-android-ack';
const kt=project+'/app/src/main/java/com/atozpackersmovers/drivertrackerv5/';
const original=p=>cp.execFileSync('git',['show',`${base}:${p}`],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
const current=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const files=[project+'/app/src/main/AndroidManifest.xml',project+'/app/schemas/com.atozpackersmovers.drivertrackerv5.offline.TrackerDatabase/2.json',...['offline/TrackerDatabase.kt','offline/OfflinePointEntity.kt','trip/TripModels.kt','trip/TripStateMachine.kt','security/AuthSessionProvider.kt','security/DeviceIdentityProvider.kt','security/ProductionApprovalGate.kt','firebase/FirebaseGpsUploader.kt','location/TrackingService.kt','location/LocationProcessor.kt','offline/UploadWorker.kt','command/CommandAcknowledgementCodec.kt'].map(p=>kt+p)];
const results=files.map(file=>{const text=current(file);assert.equal(text,original(file),file+' changed');return{file,unchanged:true,sha256:crypto.createHash('sha256').update(text).digest('hex')};});
const entity=s=>s.slice(s.indexOf('@Entity'),s.indexOf('\nclass CommandIdempotencyStore'));
// The new storage interface sits in another file; entity definition itself must remain byte-identical.
assert.equal(entity(current(kt+'command/CommandIdempotencyStore.kt')),entity(original(kt+'command/CommandIdempotencyStore.kt')));
const config=current(project+'/app/build.gradle.kts'),oldConfig=original(project+'/app/build.gradle.kts');
for(const line of oldConfig.split('\n').filter(l=>/applicationId =|minSdk =|targetSdk =|buildConfigField\(/.test(l)))assert(config.includes(line),'Configuration changed: '+line.trim());
const oldRepo=original(kt+'firebase/ProductionFirebaseRepository.kt'),newRepo=current(kt+'firebase/ProductionFirebaseRepository.kt');
assert.equal(newRepo.slice(newRepo.indexOf('    override suspend fun uploadLive')),oldRepo.slice(oldRepo.indexOf('    override suspend fun uploadLive')),'Cloud trip/live upload implementation changed');
const report={at:new Date().toISOString(),baseline:cp.execFileSync('git',['rev-parse',base],{cwd:root,encoding:'utf8'}).trim(),mode:'SOURCE_AND_GENERATED_ROOM_SCHEMA_COMPARISON_NOT_DEVICE_UPGRADE_TEST',entityUnchanged:true,identityAndPermissionConfigurationUnchanged:true,tripAndLiveUploadCodeUnchanged:true,files:results};
fs.writeFileSync(path.join(root,'docs/driver-ack-protocol-20261016/preservation-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(`PASS: ${files.length} preserved files, Room command entity, identity/build permissions, trip/live upload code.`);
