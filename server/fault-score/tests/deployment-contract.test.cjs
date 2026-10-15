'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../relay/constants.cjs'),plan=require('../cycle-rollover.review.json');
test('review blueprint cannot grant public access to core or grant database/owner secret access to edge identities',()=>{
 assert.equal(plan.reviewOnly,true);assert.deepEqual(plan.newIamGrants,[]);assert.deepEqual(plan.newCredentials,[]);
 assert.deepEqual(plan.buildAndDeployOnly,['staffScore']);assert.equal(plan.scheduler.creationRequiresApproval,true);
 assert.equal(plan.scheduler.schedule,'0 0 * * *');assert.equal(plan.scheduler.timeZone,'Asia/Kolkata');
 assert.equal(plan.scheduler.topicName,'projects/'+C.PROJECT+'/topics/fault-score-events');
 assert.deepEqual(plan.scheduler.message,{kind:'cycle-rollover',version:1});
 assert.equal(plan.requiresAdoptionAndArmingBeforeFirstBoundary,true);
});
test('actual function exports match isolated runtime identities and core never exports a public invoker',()=>{
 const functions=require('../index.cjs');assert.deepEqual(Object.keys(functions).sort(),['faultIngress','faultOwnerGateway','staffScore']);
 const ingress=functions.faultIngress.__endpoint,gateway=functions.faultOwnerGateway.__endpoint,core=functions.staffScore.__endpoint;
 assert.equal(ingress.serviceAccountEmail,C.INGRESS_SA);assert.equal(gateway.serviceAccountEmail,C.GATEWAY_SA);assert.equal(core.serviceAccountEmail,'azp-fault-runtime@az-packers-quotation.iam.gserviceaccount.com');
 assert.deepEqual(ingress.httpsTrigger.invoker,['public']);assert.deepEqual(gateway.httpsTrigger.invoker,['public']);assert.deepEqual(core.httpsTrigger.invoker,['private']);
 assert.equal(ingress.secretEnvironmentVariables.length,1);assert.equal(ingress.secretEnvironmentVariables[0].key,'AZP_FAULT_SLACK_SIGNING_SECRET');assert(!gateway.secretEnvironmentVariables?.length);assert.equal(core.secretEnvironmentVariables.length,2);
});
