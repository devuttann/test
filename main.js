let buttons = [];
let buttonStates = {};
let buttonTimers = {};
let pressCount = 0; // total number of button activations

let handCursor;

let platformImg;
let bgStatic;

let alertImg, alertImg1;
// dialog images (assets/dlgs/1.png .. 9.png)
let dlgImages = {};
let initialDlgIndex = 0;
let initialDlgActive = true;

// post-button dialog sequencing state
let postBtnDlgStep = 0; // 0 = not started, 1..5 steps, >5 disables
let postBtnDlgDisabled = false;

// currently visible dialog (id number)
let currentDialogId = null;
// whether a dialog is waiting to be dismissed by a click
let dialogWaitingForDismiss = false;

let havocMode = false;

// scaling
let scaleFactor;
let offsetX = 0;
let offsetY = 0;
// virtual design canvas (fixed 16:9 ratio)
let baseW = 1920;
let baseH = 1080;

// frame animation
let frames = [];
let currentFrame = 0;
let frameDelay = 100;
let lastFrameTime = 0;
let frameFPS = 12;

// track when havoc started so we can wait 3s before switching BG to frames
let havocStartTime = 0;

// alert blink
let alertToggle = false;
let lastAlertTime = 0;
let alertInterval = 300;

// flicker
let lastFlickerTime = 0;
let flickerInterval = 150;

function preload() {
  bgStatic = loadImage("assets/bg1.jpg");
  platformImg = loadImage("assets/platform.png");

  handCursor = loadImage("assets/hand.png");

  alertImg = loadImage("assets/alert.png");
  alertImg1 = loadImage("assets/alert1.png");

  // load dialog images 1..9
  for (let i = 1; i <= 9; i++) {
    dlgImages[i] = loadImage(`assets/dlgs/${i}.png`);
  }

  // buttons (FULL SCREEN IMAGES)
  let names = ["a", "b", "c", "d", "e", "f", "g"];

  for (let n of names) {
    let normal = loadImage(`assets/${n}btn.png`);
    let active = loadImage(`assets/${n}btn1.png`);

    // ensure pixel arrays are available for alpha checks
    // we'll call loadPixels() after the image is loaded by p5; calling here is safe because
    // preload() waits for loadImage to finish before continuing.
    normal.loadPixels();
    active.loadPixels();

    buttons.push({
      name: n,
      normal: normal,
      active: active,

      // 👇 CLICK ZONES (YOU MUST ADJUST THESE)
      x: 300,
      y: 700,
      w: 200,
      h: 200
    });

    buttonStates[n] = false;
  }

  // frames
  for (let i = 0; i <= 12; i++) {
    let num = nf(i, 4);
    frames.push(loadImage(`assets/seq1/frame${num}.png`));
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  noCursor();
  calculateScale();
  // set desired frame delay for animation loop (ms per frame)
  frameDelay = 1000 / frameFPS;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  calculateScale();
}

function calculateScale() {
  // keep a fixed virtual canvas of 1920x1080 (16:9) and scale it to fit
  let scaleX = width / baseW;
  let scaleY = height / baseH;

  // fit (contain) the virtual canvas inside the browser while keeping aspect
  scaleFactor = min(scaleX, scaleY);

  // center the virtual canvas
  offsetX = (width - baseW * scaleFactor) / 2;
  offsetY = (height - baseH * scaleFactor) / 2;
}

function draw() {
  background(0);

  push();
  translate(offsetX, offsetY);
  scale(scaleFactor);

  // ---------- BACKGROUND ----------
  if (!havocMode) {
    image(bgStatic, 0, 0, baseW, baseH);
  } else {
    // when havoc starts, keep the static background for 3 seconds
    // then switch to the frame sequence as the background
    if (millis() - havocStartTime < 3000) {
      image(bgStatic, 0, 0, baseW, baseH);
    } else {
      animateFrames();
    }
  }

  // ---------- PLATFORM ----------
  image(platformImg, 0, 0, baseW, baseH);

  // ---------- BUTTON LAYERS ----------
  for (let btn of buttons) {
    let img = buttonStates[btn.name] ? btn.active : btn.normal;
    image(img, 0, 0, baseW, baseH);
  }

  // ---------- ALERT ----------
  if (havocMode) {
    blinkAlert();
    flickerButtons();
  }

  pop();

  // ---------- DIALOG OVERLAY ----------
  // initial dialog sequence (1..4) is progressed by any click while it's active
  if (initialDlgActive) {
    let id = initialDlgIndex + 1; // initialDlgIndex 0 -> image 1
    if (dlgImages[id]) {
      image(dlgImages[id], 0, 0, baseW, baseH);
    }
  } else {
    // show transient dialog images triggered by buttons; they remain until
    // the player clicks to dismiss (click-to-advance)
    if (currentDialogId && dlgImages[currentDialogId]) {
      image(dlgImages[currentDialogId], 0, 0, baseW, baseH);
    }
  }

  // ---------- HAND CURSOR (FULLSCREEN IMAGE) ----------
  drawHandCursor();
}

// ---------- HAND CURSOR ----------
function drawHandCursor() {
  // Draw the hand in world (virtual canvas) coordinates so it scales
  // uniformly with the rest of the UI (no stretching).
  if (!handCursor) return;

  // convert mouse to virtual canvas coordinates
  let mx = (mouseX - offsetX) / scaleFactor;
  let my = (mouseY - offsetY) / scaleFactor;

  // clamp visual cursor so it cannot go above pixel height 580 of the virtual canvas
  // (allowed range is 580..baseH)
  let myClamped = constrain(my, 580, baseH);

  // Use the hand image's native dimensions so aspect is preserved
  let hw = handCursor.width || 64;
  let hh = handCursor.height || 64;

  // hotspot coordinates inside hand.png (image pixels) that should align
  // with the cursor position. Change these if you want a different hotspot.
  const hotspotX = 200;
  const hotspotY = 150;

  push();
  translate(offsetX, offsetY);
  scale(scaleFactor);
  // draw image so the (hotspotX, hotspotY) pixel of the hand image is at mx,myClamped
  image(handCursor, mx - hotspotX, myClamped - hotspotY, hw, hh);
  pop();
}

// ---------- CLICK ----------
function mousePressed() {
  let mx = (mouseX - offsetX) / scaleFactor;
  let my = (mouseY - offsetY) / scaleFactor;

  // If initial dialog sequence is active, advance it on any click and don't
  // process button clicks.
  if (initialDlgActive) {
    initialDlgIndex++;
    if (initialDlgIndex >= 4) {
      // we've shown 1..4 (indices 0..3), stop the initial dialog sequence
      initialDlgActive = false;
    }
    return;
  }

  // If a dialog is currently waiting for dismiss, any click should dismiss
  // it and not process button clicks.
  if (dialogWaitingForDismiss && currentDialogId) {
    currentDialogId = null;
    dialogWaitingForDismiss = false;
    return;
  }

  for (let btn of buttons) {
    // For clicks we consider any non-transparent pixel from either the normal
    // or the active image as clickable. When clicked, set the button to active
    // (show btn1) and revert to normal after 3 seconds. Restart timer if needed.
    let normalImg = btn.normal;
    let activeImg = btn.active;

    // need at least one image loaded to test
    if ((!normalImg || !normalImg.width || !normalImg.height) && (!activeImg || !activeImg.width || !activeImg.height)) continue;

    // We'll use the normal image dimensions if available, otherwise active's.
    let imgW = (normalImg && normalImg.width) ? normalImg.width : activeImg.width;
    let imgH = (normalImg && normalImg.height) ? normalImg.height : activeImg.height;

    let ix = Math.floor((mx / baseW) * imgW);
    let iy = Math.floor((my / baseH) * imgH);

    if (ix < 0 || iy < 0 || ix >= imgW || iy >= imgH) continue;

    // sample alpha from normal and active (if present). If either is opaque at
    // this pixel, treat it as a hit.
    let an = 0;
    let aa = 0;
    try {
      if (normalImg && normalImg.width) {
        let cn = normalImg.get(ix, iy);
        if (Array.isArray(cn) && cn.length >= 4) an = cn[3]; else an = alpha(cn);
      }
    } catch (e) {
      an = 0;
    }

    try {
      if (activeImg && activeImg.width) {
        let ca = activeImg.get(ix, iy);
        if (Array.isArray(ca) && ca.length >= 4) aa = ca[3]; else aa = alpha(ca);
      }
    } catch (e) {
      aa = 0;
    }

    if (an > 10 || aa > 10) {
      // increment total press count (used to enable havoc after first 5 presses)
      pressCount++;

      // activate the button (show btn1)
      buttonStates[btn.name] = true;

      // clear any existing timer
      if (buttonTimers[btn.name]) {
        clearTimeout(buttonTimers[btn.name]);
      }

      // set a timer to revert after 3 seconds
      buttonTimers[btn.name] = setTimeout(() => {
        buttonStates[btn.name] = false;
        buttonTimers[btn.name] = null;
      }, 3000);

      // start havoc only after the first 5 activations
      if (pressCount > 5 && !havocMode) {
        startHavoc();
      }

      // Dialog logic triggered by button activations (post-initial sequence)
      if (!postBtnDlgDisabled) {
        // if sequence hasn't started, first activation should display 5
        if (postBtnDlgStep === 0) {
          currentDialogId = 5;
          dialogWaitingForDismiss = true;
          postBtnDlgStep = 1;
        } else if (postBtnDlgStep === 1) {
          // next button click -> 6
          currentDialogId = 6;
          dialogWaitingForDismiss = true;
          postBtnDlgStep = 2;
        } else if (postBtnDlgStep === 2) {
          currentDialogId = 7;
          dialogWaitingForDismiss = true;
          postBtnDlgStep = 3;
        } else if (postBtnDlgStep === 3) {
          currentDialogId = 8;
          dialogWaitingForDismiss = true;
          postBtnDlgStep = 4;
        } else if (postBtnDlgStep === 4) {
          // next click -> 9, then disable further dialogs until much later
          currentDialogId = 9;
          dialogWaitingForDismiss = true;
          postBtnDlgStep = 5;
          postBtnDlgDisabled = true;
        }
      }

      break;
    }
  }
}

// ---------- HAVOC ----------
function startHavoc() {
  havocMode = true;
  havocStartTime = millis();
  // reset frame timer so the animation doesn't jump immediately
  lastFrameTime = millis();
}

// ---------- FLICKER ----------
function flickerButtons() {
  if (millis() - lastFlickerTime > flickerInterval) {
    for (let key in buttonStates) {
      buttonStates[key] = random() > 0.5;
    }
    lastFlickerTime = millis();
  }
}

// ---------- ALERT ----------
function blinkAlert() {
  if (millis() - lastAlertTime > alertInterval) {
    alertToggle = !alertToggle;
    lastAlertTime = millis();
  }

  let img = alertToggle ? alertImg : alertImg1;

  image(img, 0, 0, baseW, baseH);
}

// ---------- FRAME BG ----------
function animateFrames() {
  if (millis() - lastFrameTime > frameDelay) {
    currentFrame = (currentFrame + 1) % frames.length;
    lastFrameTime = millis();
  }

  image(frames[currentFrame], 0, 0, baseW, baseH);
}