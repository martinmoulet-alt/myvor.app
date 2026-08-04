const test=require('node:test');
const assert=require('node:assert/strict');
const {withRetry,isTransientError}=require('../.test-dist/reliability.js');

test('retries transient failures and eventually succeeds',async()=>{
  let attempts=0;
  const result=await withRetry(async()=>{
    attempts++;
    if(attempts<3){const error=new Error('network temporarily unavailable');error.status=503;throw error;}
    return 'ok';
  },{attempts:3,baseDelayMs:0});
  assert.equal(result,'ok');
  assert.equal(attempts,3);
});

test('does not retry non transient errors',async()=>{
  let attempts=0;
  await assert.rejects(()=>withRetry(async()=>{attempts++;const error=new Error('bad request');error.status=400;throw error;},{attempts:3,baseDelayMs:0}));
  assert.equal(attempts,1);
});

test('classifies server and timeout failures as transient',()=>{
  assert.equal(isTransientError(Object.assign(new Error('service unavailable'),{status:503})),true);
  assert.equal(isTransientError(new Error('network timeout')),true);
  assert.equal(isTransientError(Object.assign(new Error('bad request'),{status:400})),false);
});
