'use strict';
const PROJECT='az-packers-quotation';
module.exports=Object.freeze({PROJECT,CORE_URL:'https://staffscore-onqwi7to4a-el.a.run.app',
 OWNER_UID:'88IIhxscilQqcT0XsHqRpE0JC0V2',OWNER_ORIGIN:'https://atozpackersmovers.in',
 PUSH_SA:`azp-fault-push@${PROJECT}.iam.gserviceaccount.com`,
 GATEWAY_SA:`azp-fault-owner-gateway@${PROJECT}.iam.gserviceaccount.com`,
 INGRESS_SA:`azp-fault-ingress@${PROJECT}.iam.gserviceaccount.com`,
 TOPIC:`projects/${PROJECT}/topics/fault-score-events`,
 SUBSCRIPTION:`projects/${PROJECT}/subscriptions/fault-score-core-push`,
 WORKER_PATH:'/internal/fault-score/events',MAX_RAW:65536,MAX_PUSH:160000,
 ACK_BUDGET_MS:2200,MAX_QUEUE_AGE_MS:86400000,
 OWNER_PATHS:Object.freeze(['/api/staff-score/owner-session','/api/staff-score','/api/staff-score/audit','/api/staff-score/readiness'])});
