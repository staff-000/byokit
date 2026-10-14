// Shared, credential-free report validation. Used by the service and trusted Actions.
export function validateSubmission(report,catalog,now=Date.now()){
 const allowed=['operationId','offeringId','modelId','protocol','checkedAt','latencyMs','maxTokens'];
 if(!report||typeof report!=='object'||Array.isArray(report)||Object.keys(report).some(k=>!allowed.includes(k)))throw new Error('Invalid verification fields.');
 if(typeof report.operationId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(report.operationId))throw new Error('Invalid operation ID.');
 const offering=catalog.offerings.find(o=>o.id===report.offeringId);
 if(!offering||offering.deployment!=='hosted'||offering.apiModelId!==report.modelId)throw new Error('Only the selected catalog-hosted model can be published.');
 const expected=offering.providerId==='anthropic'?'anthropic':offering.providerId==='google'?'gemini':'chat';
 if(report.protocol!==expected)throw new Error('API protocol does not match the selected provider.');
 const time=Date.parse(report.checkedAt);
 if(typeof report.checkedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(report.checkedAt)||!Number.isFinite(time)||time>now+60000||now-time>7200000)throw new Error('Verification is expired or has an invalid timestamp.');
 if(!Number.isInteger(report.latencyMs)||report.latencyMs<0||report.latencyMs>180000||!Number.isInteger(report.maxTokens)||report.maxTokens<16||report.maxTokens>8192)throw new Error('Invalid call settings.');
 return offering;
}
export function canonicalReport(report,user,catalog,now=Date.now()){
 validateSubmission(report,catalog,now);
 if(!user||!Number.isSafeInteger(user.id)||user.id<=0||typeof user.login!=='string'||!/^[a-z0-9-]{1,39}$/i.test(user.login))throw new Error('Authenticated GitHub identity is required.');
 return {id:`website:${user.id}:${report.operationId}`,offeringId:report.offeringId,contributor:`github:${user.login}`,checkedAt:report.checkedAt,result:'passed',checks:['textGeneration'],adapter:'byokit-website@1',evidence:'https://github.com/staff-000/byokit/blob/main/catalog/verifications.json',notes:`Community-reported successful ${report.protocol} call. Output budget ${report.maxTokens}; latency ${report.latencyMs} ms. GitHub identity authenticated; provider call ran in the contributor’s browser.`};
}
