'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../relay/constants.cjs'),plan=require('../deployment.delta.review.json');
test('staff feature requires reviewed identities and separate deployment, without new IAM or credentials',()=>{assert.equal(plan.reviewOnly,true);assert.equal(plan.staffAccessEnabledByDefault,false);assert.deepEqual(plan.newIamGrants,[]);assert.deepEqual(plan.newCredentials,[]);assert.deepEqual(plan.newPublicServices,[]);assert.equal(plan.requiredApprovedBindings,4);assert.equal(plan.preserveCorePrivate,true);assert.equal(plan.deployRequiresSeparateApproval,true);assert.equal(plan.staffPath,C.SELF_PATH);assert(!C.OWNER_PATHS.includes(C.SELF_PATH));});

test('actual function exports match isolated runtime identities and core never exports a public invoker',()=>{
 const functions=require('../index.cjs');assert.deepEqual(Object.keys(functions).sort(),['faultIngress','faultOwnerGateway','staffScore']);
 const ingress=functions.faultIngress.__endpoint,gateway=functions.faultOwnerGateway.__endpoint,core=functions.staffScore.__endpoint;
 assert.equal(ingress.serviceAccountEmail,C.INGRESS_SA);assert.equal(gateway.serviceAccountEmail,C.GATEWAY_SA);assert.equal(core.serviceAccountEmail,'azp-fault-runtime@az-packers-quotation.iam.gserviceaccount.com');
 assert.deepEqual(ingress.httpsTrigger.invoker,['public']);assert.deepEqual(gateway.httpsTrigger.invoker,['public']);assert.deepEqual(core.httpsTrigger.invoker,['private']);
 assert.equal(ingress.secretEnvironmentVariables.length,1);assert.equal(ingress.secretEnvironmentVariables[0].key,'AZP_FAULT_SLACK_SIGNING_SECRET');assert(!gateway.secretEnvironmentVariables?.length);assert.equal(core.secretEnvironmentVariables.length,2);
});
