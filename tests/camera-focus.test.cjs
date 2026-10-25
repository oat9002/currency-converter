const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-fixture.cjs');

async function openCamera({ modes = ['single-shot', 'continuous'], points = true, apply } = {}) {
  const requests = [];
  const track = {
    getCapabilities: () => ({ focusMode: modes }),
    getConstraints: () => ({ width: { ideal: 1280 }, advanced: [{ zoom: 2 }] }),
    applyConstraints: constraints => { requests.push(constraints); return apply?.(); },
    stop() {}
  };
  const app = loadApp({ navigator: { languages: ['en'], mediaDevices: {
    getUserMedia: async () => ({ getVideoTracks: () => [track], getTracks: () => [track] }),
    getSupportedConstraints: () => ({ pointsOfInterest: points })
  } } });
  await app.element('camera-btn').listeners.click();
  const video = app.element('camera-video');
  video.videoWidth = 200;
  video.videoHeight = 100; // letterboxed vertically inside the 100 x 100 element
  app.element('camera-focus-marker').parentElement = video;
  return { ...app, requests, video, track };
}

test('tap focuses at normalized image coordinates and preserves existing constraints', async () => {
  const { context, element, requests } = await openCamera();
  await element('camera-video').listeners.click({ clientX: 25, clientY: 60 });
  assert.equal(requests.length, 1);
  const constraints = JSON.parse(JSON.stringify(requests[0]));
  assert.deepEqual(constraints, {
    width: { ideal: 1280 }, advanced: [{ zoom: 2 }, { focusMode: 'single-shot', pointsOfInterest: [{ x: 0.25, y: 0.7 }] }]
  });
  assert.equal(element('camera-focus-marker').hidden, false);
  context.closeCamera();
  assert.equal(element('camera-focus-marker').hidden, true);
});

test('ignores letterboxes, unready video, and taps during capture', async () => {
  const { context, video, element, requests } = await openCamera();
  await context.focusCamera(50, 10);
  video.videoWidth = 100;
  video.videoHeight = 200;
  await context.focusCamera(10, 50);
  video.videoWidth = 0;
  await context.focusCamera(50, 50);
  video.videoWidth = 200;
  element('capture-btn').disabled = true;
  await context.focusCamera(50, 50);
  assert.equal(requests.length, 0);
  context.closeCamera();
});

test('unsupported browsers and fixed-focus cameras report unavailable without a marker', async () => {
  for (const options of [{ points: false }, { modes: ['manual'] }]) {
    const { context, element, requests } = await openCamera(options);
    await context.focusCamera(50, 50);
    assert.equal(requests.length, 0);
    assert.equal(element('camera-focus-marker').hidden, true);
    assert.match(element('camera-focus-status').textContent, /unavailable/);
    context.closeCamera();
  }
});

test('focus failure allows retry and keyboard requests focus at the image center', async () => {
  let fail = true;
  const { context, video, element, requests } = await openCamera({ modes: ['continuous'], apply: async () => {
    if (fail) throw new Error('Driver rejected focus');
  } });
  await context.focusCamera(50, 50);
  assert.match(element('camera-focus-status').textContent, /Unable to focus/);
  fail = false;
  let prevented = false;
  video.listeners.keydown({ key: 'Enter', preventDefault() { prevented = true; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prevented, true);
  assert.equal(requests.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(requests[1].advanced[1])), {
    focusMode: 'continuous', pointsOfInterest: [{ x: 0.5, y: 0.5 }]
  });
  assert.equal(element('camera-focus-marker').hidden, false);
  context.closeCamera();
});

test('serializes focus requests and ignores results after closing the camera', async () => {
  let finish;
  const { context, element, requests } = await openCamera({ apply: () => new Promise(resolve => { finish = resolve; }) });
  const focusing = context.focusCamera(25, 50);
  await context.focusCamera(75, 50);
  assert.equal(requests.length, 1);
  context.closeCamera();
  finish();
  await focusing;
  assert.equal(element('camera-focus-marker').hidden, true);
});
