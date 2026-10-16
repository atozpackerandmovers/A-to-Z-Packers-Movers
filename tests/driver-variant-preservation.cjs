const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),baseline='cffcadc571f2e5e117c795cb4a7cfa146008678d';
const normalize=s=>s.replace(/\r\n/g,'\n').trimEnd();
const report={baseline,mode:'SOURCE_PRESERVATION_NOT_INSTALLED_DEVICE_EVIDENCE',drivers:[]};
for(const driver of ['ajay','somnath']){
 const base='integrations/driver-android-'+driver,kt=base+'/app/src/main/java/com/atozpackersmovers/drivertrackerv5/';
 const read=p=>normalize(fs.readFileSync(path.join(root,p),'utf8'));
 const old=p=>normalize(cp.execFileSync('git',['show',baseline+':'+p],{cwd:root,encoding:'utf8'}));
 const files=cp.execFileSync('git',['ls-tree','-r','--name-only',baseline,'--',base+'/app/src/main',base+'/app/schemas'],{cwd:root,encoding:'utf8'}).trim().split('\n');
 const permitted=new Set(['application/TrackerApplication.kt','command/CommandIdempotencyStore.kt','command/TripCommandConsumer.kt','firebase/FirebaseCommandSource.kt','firebase/FirebaseRepository.kt','firebase/ProductionFirebaseRepository.kt','offline/OfflinePointDao.kt'].map(p=>kt+p));
 let unchanged=0;
 for(const file of files){if(!permitted.has(file)){assert.equal(read(file),old(file),file+' unexpectedly changed');unchanged++;}}
 const config=read(base+'/app/build.gradle.kts');
 for(const line of old(base+'/app/build.gradle.kts').split('\n').filter(l=>/applicationId =|minSdk =|targetSdk =|buildConfigField\(/.test(l))) assert(config.includes(line),driver+' configuration changed: '+line.trim());
 const entity=s=>s.slice(s.indexOf('@Entity'),s.indexOf('\nclass CommandIdempotencyStore'));
 assert.equal(entity(read(kt+'command/CommandIdempotencyStore.kt')),entity(old(kt+'command/CommandIdempotencyStore.kt')));
 const tail=s=>s.slice(s.indexOf('    override suspend fun uploadLive'));
 assert.equal(tail(read(kt+'firebase/ProductionFirebaseRepository.kt')),tail(old(kt+'firebase/ProductionFirebaseRepository.kt')));
 if(driver==='somnath') assert(read(kt+'command/TripCommandConsumer.kt').includes('stateMachine.start(command, assignment, fix, clock())'),'Existing slow-fix timing must survive');
 report.drivers.push({driver,unchangedFiles:unchanged,identityPermissionsSchemaAndLocationPreserved:true});
}
console.log(JSON.stringify(report,null,2));
