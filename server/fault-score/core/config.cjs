'use strict';
const {validateActivation}=require('./activation.cjs');
const STAFF=Object.freeze([
 {id:'INDOOR_STAFF_ZD9A1Z',slackUserId:'U0C8TRXLFME',channelId:'D0C835L6UHJ',names:['Sanju']},
 {id:'INDOOR_STAFF_10HIAWK',slackUserId:'U0C823YM3PV',channelId:'D0C7SUYTH8X',names:['Ranjit','Ranjit Sarkar']},
 {id:'INDOOR_STAFF_1MJSC46',slackUserId:'U0C7T9YMRGB',channelId:'D0C7J5K2NP9',names:['Swagatika']},
 {id:'INDOOR_STAFF_9JJREB',slackUserId:'U0C859SS1LP',channelId:'D0C8QBP090U',names:['Srinivas']}
]);
function config(env=process.env,signingSecret){
 const activation=validateActivation({enabled:env.AZP_FAULT_ENABLED==='true',notBefore:env.AZP_FAULT_NOT_BEFORE});
 if(typeof signingSecret!=='string'||!signingSecret||!/^https:\/\/[a-z0-9-]+\.slack\.com$/.test(env.AZP_SLACK_WORKSPACE_URL||''))throw Error('Reviewed Slack runtime configuration required');
 return {enabled:true,ownerOnlyRead:true,ownerSubject:'88IIhxscilQqcT0XsHqRpE0JC0V2',adminSubjects:['88IIhxscilQqcT0XsHqRpE0JC0V2'],workspaceId:'T0BQ4DD754J',workspaceUrl:env.AZP_SLACK_WORKSPACE_URL,ownerUserId:'U0BQYQEMYNL',slackAppId:'A0C8HU05JCD',signingSecret,ingress:{mode:'owner-user-events',authorizedUserId:'U0BQYQEMYNL'},activation,staff:STAFF.map(({id,slackUserId,names})=>({id,slackUserId,names:[...names]})),dmMappings:STAFF.map(({id,channelId})=>({staffId:id,channelId}))};
}
module.exports={config,STAFF};
