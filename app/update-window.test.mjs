import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateWindow } from './update-window.mjs';

test('new data and interaction do not restart the 15-second deadline',()=>{
  let now=0;const window=createUpdateWindow(15000,()=>now);
  window.start();now=6000;window.start();assert.equal(window.remaining(),9000);
  now=61000;assert.equal(window.remaining(),0);
  window.clear();window.start();assert.equal(window.remaining(),15000);
});

test('explicit pause freezes the countdown and resume continues its remaining time',()=>{
  let now=0;const window=createUpdateWindow(15000,()=>now);
  window.start();now=4000;window.setPaused(true);now=90000;
  window.start();window.setPaused(true);assert.equal(window.remaining(),11000);
  window.setPaused(false);now=100999;assert.equal(window.remaining(),1);
  now=101000;assert.equal(window.remaining(),0);
  window.clear();window.start();assert.equal(window.remaining(),15000);
});
