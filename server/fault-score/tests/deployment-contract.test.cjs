'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../relay/constants.cjs'),plan=require('../deployment/resources.review.json');
test('review blueprint cannot grant public access to core or grant database/owner secret access to edge identities',()=>{
 assert.equal(plan.reviewOnly,true);assert.equal(plan.productionChangesApplied,false);assert.equal(plan.userManagedKeysAllowed,false);assert.equal(plan.newPaidBuildsRun,0);
 const publicGrants=plan.proposedIamGrants.filter(g=>g.member==='allUsers');assert.equal(publicGrants.length,2);assert(publicGrants.every(g=>/\/services\/(faultingress|faultownergateway)$/.test(g.resource)));
 for(const identity of [C.INGRESS_SA,C.GATEWAY_SA,C.PUSH_SA])assert(!plan.proposedIamGrants.some(g=>g.member==='serviceAccount:'+identity&&/datastore|firestore|owner_user_token/i.test(g.role+' '+g.resource)));
 assert(!plan.proposedIamGrants.some(g=>g.member==='serviceAccount:'+C.INGRESS_SA&&/staffscore$/.test(g.resource)));
 const subscription=plan.subscriptions.find(s=>s.name===C.SUBSCRIPTION);assert.equal(subscription.pushConfig.oidcToken.audience,C.CORE_URL);assert.equal(subscription.pushConfig.oidcToken.serviceAccountEmail,C.PUSH_SA);assert.equal(subscription.pushConfig.pushEndpoint,C.CORE_URL+C.WORKER_PATH);assert.equal(subscription.deadLetterPolicy.maxDeliveryAttempts,5);assert.equal(subscription.messageRetentionDuration,'86400s');assert.equal(plan.activation.authorized,false);assert.equal(plan.alerts.activationBlockedUntilChannelVerified,true);
});
test('actual function exports match isolated runtime identities and core never exports a public invoker',()=>{
 const functions=require('../index.cjs');assert.deepEqual(Object.keys(functions).sort(),['faultIngress','faultOwnerGateway','staffScore']);
 const ingress=functions.faultIngress.__endpoint,gateway=functions.faultOwnerGateway.__endpoint,core=functions.staffScore.__endpoint;
 assert.equal(ingress.serviceAccountEmail,C.INGRESS_SA);assert.equal(gateway.serviceAccountEmail,C.GATEWAY_SA);assert.equal(core.serviceAccountEmail,'azp-fault-runtime@az-packers-quotation.iam.gserviceaccount.com');
 assert.deepEqual(ingress.httpsTrigger.invoker,['public']);assert.deepEqual(gateway.httpsTrigger.invoker,['public']);assert.deepEqual(core.httpsTrigger.invoker,['private']);
 assert.equal(ingress.secretEnvironmentVariables.length,1);assert.equal(ingress.secretEnvironmentVariables[0].key,'AZP_FAULT_SLACK_SIGNING_SECRET');assert(!gateway.secretEnvironmentVariables?.length);assert.equal(core.secretEnvironmentVariables.length,2);
});
