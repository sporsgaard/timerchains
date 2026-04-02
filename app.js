// ============================================================
// Interval Runner — app.js
// ============================================================

(function () {
  'use strict';

  // --- Service Worker Registration ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // --- DOM refs ---
  const $ = id => document.getElementById(id);
  const homeScreen = $('home-screen');
  const editorScreen = $('editor-screen');
  const execScreen = $('exec-screen');
  const workoutListEl = $('workout-list');
  const workoutNameEl = $('workout-name');
  const blockTreeEl = $('block-tree');
  const silentAudio = $('silent-audio');

  // --- State ---
  let workouts = [];       // Array of { id, name, blocks }
  let currentWorkout = null; // The workout being edited
  let editorBlocks = null;   // Root group block for editor

  // --- Storage ---
  function loadWorkouts() {
    try {
      workouts = JSON.parse(localStorage.getItem('workouts')) || [];
    } catch { workouts = []; }
  }

  function saveWorkouts() {
    localStorage.setItem('workouts', JSON.stringify(workouts));
  }

  // --- Screen Navigation ---
  function showScreen(screen) {
    [homeScreen, editorScreen, execScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  // --- Home Screen ---
  function renderHome() {
    loadWorkouts();
    workoutListEl.innerHTML = '';

    if (workouts.length === 0) {
      workoutListEl.innerHTML = '<div class="empty-state">No workouts yet.<br>Create one to get started!</div>';
    } else {
      workouts.forEach(w => {
        const item = document.createElement('div');
        item.className = 'workout-item';
        item.innerHTML = `<span class="name">${esc(w.name || 'Untitled')}</span>
          <button class="delete-btn" data-id="${w.id}" title="Delete">&times;</button>`;
        item.querySelector('.name').addEventListener('click', () => openEditor(w));
        item.querySelector('.delete-btn').addEventListener('click', e => {
          e.stopPropagation();
          if (confirm('Delete "' + (w.name || 'Untitled') + '"?')) {
            workouts = workouts.filter(x => x.id !== w.id);
            saveWorkouts();
            renderHome();
          }
        });
        workoutListEl.appendChild(item);
      });
    }

    const btn = document.createElement('button');
    btn.className = 'new-workout-btn';
    btn.textContent = '+ New Workout';
    btn.addEventListener('click', () => openEditor(null));
    workoutListEl.appendChild(btn);
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // --- Editor ---
  function openEditor(workout) {
    if (workout) {
      currentWorkout = workout;
      editorBlocks = JSON.parse(JSON.stringify(workout.blocks));
    } else {
      currentWorkout = null;
      editorBlocks = { type: 'group', blocks: [], repeat: 1 };
    }
    workoutNameEl.value = currentWorkout ? currentWorkout.name : '';
    renderBlockTree();
    showScreen(editorScreen);
  }

  function renderBlockTree() {
    blockTreeEl.innerHTML = '';
    renderBlocks(editorBlocks.blocks, blockTreeEl, editorBlocks);
    // Add buttons at root level
    const addRow = document.createElement('li');
    addRow.className = 'block-item';
    addRow.innerHTML = `<div class="block-actions" style="margin-top:12px">
      <button class="add-leaf-root">+ Block</button>
      <button class="add-group-root">+ Group</button>
    </div>`;
    addRow.querySelector('.add-leaf-root').addEventListener('click', () => {
      editorBlocks.blocks.push({ type: 'leaf', text: '', duration: 30, repeat: 1 });
      renderBlockTree();
    });
    addRow.querySelector('.add-group-root').addEventListener('click', () => {
      editorBlocks.blocks.push({ type: 'group', blocks: [], repeat: 2 });
      renderBlockTree();
    });
    blockTreeEl.appendChild(addRow);
  }

  function renderBlocks(blocks, parentUl, parentGroup) {
    blocks.forEach((block, idx) => {
      const li = document.createElement('li');
      li.className = 'block-item';
      li.draggable = true;
      li.dataset.idx = idx;

      if (block.type === 'leaf') {
        li.innerHTML = `<div class="block-card">
          <div class="block-row">
            <span class="drag-handle">⠿</span>
            <input type="text" placeholder="Speech text" value="${esc(block.text || '')}" data-field="text">
            <label>s<input type="number" min="1" max="3600" value="${block.duration}" data-field="duration" style="width:60px;margin-left:2px"></label>
            <label>&times;<input type="number" min="1" max="99" value="${block.repeat}" data-field="repeat" style="width:70px;margin-left:2px"></label>
          </div>
          <div class="block-actions">
            <button class="del-btn">Delete</button>
          </div>
        </div>`;

        li.querySelector('[data-field="text"]').addEventListener('input', e => { block.text = e.target.value; });
        li.querySelector('[data-field="duration"]').addEventListener('input', e => { block.duration = Math.max(1, parseInt(e.target.value) || 1); });
        li.querySelector('[data-field="repeat"]').addEventListener('input', e => { block.repeat = Math.min(99, Math.max(1, parseInt(e.target.value) || 1)); });
      } else {
        li.innerHTML = `<div class="block-card group-card">
          <div class="group-header">
            <span class="drag-handle">⠿</span>
            <span class="group-label">${esc(block.name || 'Group')}</span>
            <label style="font-weight:normal">&times;<input type="number" min="1" max="99" value="${block.repeat}" data-field="repeat" style="width:70px;margin-left:2px"></label>
          </div>
          <ul class="block-tree inner-tree"></ul>
          <div class="block-actions">
            <button class="add-leaf">+ Block</button>
            <button class="add-group">+ Group</button>
            <button class="del-btn">Delete</button>
          </div>
        </div>`;

        const card = li.querySelector(':scope > .block-card');
        const groupLabel = card.querySelector('.group-label');
        groupLabel.addEventListener('click', () => {
          const input = document.createElement('input');
          input.type = 'text';
          input.value = block.name || '';
          input.placeholder = 'Group';
          input.style.cssText = 'font-size:inherit;font-weight:inherit;color:inherit;background:var(--bg);border:1px solid var(--accent);border-radius:6px;padding:2px 6px;width:120px;';
          groupLabel.replaceWith(input);
          input.focus();
          input.select();
          const commit = () => {
            block.name = input.value.trim();
            renderBlockTree();
          };
          input.addEventListener('blur', commit);
          input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
        });
        card.querySelector('[data-field="repeat"]').addEventListener('input', e => { block.repeat = Math.min(99, Math.max(1, parseInt(e.target.value) || 1)); });
        const innerTree = card.querySelector('.inner-tree');
        renderBlocks(block.blocks, innerTree, block);

        card.querySelector(':scope > .block-actions > .add-leaf').addEventListener('click', e => {
          e.stopPropagation();
          block.blocks.push({ type: 'leaf', text: '', duration: 30, repeat: 1 });
          renderBlockTree();
        });
        card.querySelector(':scope > .block-actions > .add-group').addEventListener('click', e => {
          e.stopPropagation();
          block.blocks.push({ type: 'group', blocks: [], repeat: 2 });
          renderBlockTree();
        });
      }

      li.querySelector(':scope > .block-card > .block-actions > .del-btn').addEventListener('click', e => {
        e.stopPropagation();
        blocks.splice(idx, 1);
        renderBlockTree();
      });

      // Drag & drop
      setupDrag(li, blocks, idx, parentUl);

      parentUl.appendChild(li);
    });
  }

  // --- Drag & Drop ---
  let dragSrcIdx = null;
  let dragSrcList = null;
  let handleActive = false;

  function setupDrag(li, blockList, idx, parentUl) {
    // Track mousedown/touchstart on handle so dragstart knows it's legit
    const handle = li.querySelector('.drag-handle');
    if (handle) {
      handle.addEventListener('mousedown', () => { handleActive = true; });
      handle.addEventListener('touchstart', () => { handleActive = true; }, { passive: true });
    }

    li.addEventListener('dragstart', e => {
      if (!handleActive) { e.preventDefault(); return; }
      handleActive = false;
      e.stopPropagation();
      dragSrcIdx = idx;
      dragSrcList = blockList;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
    });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); handleActive = false; });
    li.addEventListener('dragover', e => {
      if (dragSrcList !== blockList) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      li.classList.add('drag-over');
    });
    li.addEventListener('dragleave', () => { li.classList.remove('drag-over'); });
    li.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      li.classList.remove('drag-over');
      if (dragSrcList === blockList && dragSrcIdx !== null && dragSrcIdx !== idx) {
        const moved = blockList.splice(dragSrcIdx, 1)[0];
        blockList.splice(idx, 0, moved);
        renderBlockTree();
      }
    });
  }

  // --- Save ---
  $('save-btn').addEventListener('click', () => {
    const name = workoutNameEl.value.trim() || 'Untitled';
    if (currentWorkout) {
      currentWorkout.name = name;
      currentWorkout.blocks = JSON.parse(JSON.stringify(editorBlocks));
    } else {
      currentWorkout = { id: Date.now(), name, blocks: JSON.parse(JSON.stringify(editorBlocks)) };
      workouts.push(currentWorkout);
    }
    saveWorkouts();
    showScreen(homeScreen);
    renderHome();
  });

  $('editor-back').addEventListener('click', () => {
    showScreen(homeScreen);
    renderHome();
  });

  // --- Flatten blocks for execution ---
  function flattenBlocks(block) {
    const steps = [];
    if (block.type === 'leaf') {
      for (let r = 0; r < (block.repeat || 1); r++) {
        steps.push({ text: block.text || '', duration: block.duration || 1 });
      }
    } else if (block.type === 'group') {
      for (let r = 0; r < (block.repeat || 1); r++) {
        for (const child of (block.blocks || [])) {
          steps.push(...flattenBlocks(child));
        }
      }
    }
    return steps;
  }

  // --- Audio: Beep via Web Audio ---
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playBeep(durationMs, freq = 880) {
    return new Promise(resolve => {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.5;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
      osc.onended = resolve;
    });
  }

  // --- TTS + Beep parsing ---
  function parseTextSegments(text) {
    if (!text) return [];
    // Split on whitespace, keeping groups of dots together
    const tokens = text.trim().split(/\s+/);
    const segments = [];
    let wordBuffer = [];

    for (const token of tokens) {
      if (/^\.{1,3}$/.test(token)) {
        if (wordBuffer.length > 0) {
          segments.push({ type: 'speech', text: wordBuffer.join(' ') });
          wordBuffer = [];
        }
        const dots = token.length;
        const ms = dots === 1 ? 200 : dots === 2 ? 400 : 700;
        segments.push({ type: 'beep', duration: ms });
      } else {
        wordBuffer.push(token);
      }
    }
    if (wordBuffer.length > 0) {
      segments.push({ type: 'speech', text: wordBuffer.join(' ') });
    }
    return segments;
  }

  function speakText(text) {
    return new Promise(resolve => {
      if (!text) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.1;
      u.onend = resolve;
      u.onerror = resolve;
      speechSynthesis.speak(u);
    });
  }

  async function playSegments(segments) {
    for (const seg of segments) {
      if (execState.stopped) return;
      if (seg.type === 'beep') {
        await playBeep(seg.duration);
      } else {
        await speakText(seg.text);
      }
    }
  }

  // --- Execution ---
  let execState = {
    steps: [],
    currentStep: 0,
    running: false,
    paused: false,
    stopped: false,
    stepStartTime: 0,
    pausedElapsed: 0,
    intervalId: null,
    rafId: null,
    totalDuration: 0,
    elapsedBefore: 0 // total time of completed steps
  };

  $('run-btn').addEventListener('click', () => {
    const name = workoutNameEl.value.trim() || 'Untitled';
    // Save first
    if (currentWorkout) {
      currentWorkout.name = name;
      currentWorkout.blocks = JSON.parse(JSON.stringify(editorBlocks));
    } else {
      currentWorkout = { id: Date.now(), name, blocks: JSON.parse(JSON.stringify(editorBlocks)) };
      workouts.push(currentWorkout);
    }
    saveWorkouts();
    renderHome();

    startExecution(name, editorBlocks);
  });

  function startExecution(name, rootBlock) {
    const steps = flattenBlocks(rootBlock);
    if (steps.length === 0) { alert('No blocks to run.'); return; }

    $('exec-title').textContent = name;
    showScreen(execScreen);

    // Ensure audio context + silent loop for background execution
    getAudioCtx();
    silentAudio.play().catch(() => {});

    // Media Session
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: name,
        artist: 'Interval Runner'
      });
      navigator.mediaSession.setActionHandler('pause', () => togglePause());
      navigator.mediaSession.setActionHandler('play', () => togglePause());
      navigator.mediaSession.setActionHandler('stop', () => stopExecution());
    }

    execState = {
      steps,
      currentStep: 0,
      running: true,
      paused: false,
      stopped: false,
      stepStartTime: 0,
      pausedElapsed: 0,
      intervalId: null,
      rafId: null,
      totalDuration: steps.reduce((a, s) => a + s.duration, 0),
      elapsedBefore: 0
    };

    runStep();
  }

  async function runStep() {
    if (execState.stopped || execState.currentStep >= execState.steps.length) {
      finishExecution();
      return;
    }

    const step = execState.steps[execState.currentStep];
    const total = execState.steps.length;
    const idx = execState.currentStep;

    // Update display
    $('exec-text').textContent = step.text || '(silence)';
    $('exec-position').textContent = `Step ${idx + 1} / ${total}`;
    $('exec-controls').style.display = 'flex';

    // Update media session
    if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: step.text || `Step ${idx + 1}`,
        artist: `${idx + 1}/${total} — Interval Runner`
      });
    }

    // Play TTS/beeps
    const segments = parseTextSegments(step.text);
    // Don't await segments fully before timer — play them and let timer run concurrently
    const segPromise = playSegments(segments);

    // Start countdown timer
    execState.stepStartTime = Date.now();
    execState.pausedElapsed = 0;

    // Use setInterval for background reliability
    if (execState.intervalId) clearInterval(execState.intervalId);
    execState.intervalId = setInterval(() => tickStep(step.duration), 250);

    // Also use rAF for smooth display when visible
    const rafLoop = () => {
      if (!execState.running || execState.stopped) return;
      tickStep(step.duration);
      execState.rafId = requestAnimationFrame(rafLoop);
    };
    execState.rafId = requestAnimationFrame(rafLoop);

    // Wait for duration
    await waitForStepEnd(step.duration);
    await segPromise.catch(() => {}); // ensure segments finish or fail gracefully
    speechSynthesis.cancel(); // cut off any lingering speech

    if (execState.stopped) return;

    // Advance
    execState.elapsedBefore += step.duration;
    execState.currentStep++;
    runStep();
  }

  function tickStep(stepDuration) {
    if (execState.paused || execState.stopped) return;
    const elapsed = (Date.now() - execState.stepStartTime - execState.pausedElapsed) / 1000;
    const remaining = Math.max(0, stepDuration - elapsed);
    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    $('exec-timer').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

    // Overall progress
    const totalElapsed = execState.elapsedBefore + (stepDuration - remaining);
    const pct = execState.totalDuration > 0 ? (totalElapsed / execState.totalDuration) * 100 : 0;
    $('exec-progress').style.width = pct + '%';

    const totalRemaining = Math.max(0, execState.totalDuration - totalElapsed);
    const rm = Math.floor(totalRemaining / 60);
    const rs = Math.floor(totalRemaining % 60);
    $('exec-remaining').textContent = `${rm}:${rs.toString().padStart(2, '0')} remaining`;
  }

  function waitForStepEnd(durationSec) {
    return new Promise(resolve => {
      const check = () => {
        if (execState.stopped) { resolve(); return; }
        if (execState.paused) { setTimeout(check, 100); return; }
        const elapsed = (Date.now() - execState.stepStartTime - execState.pausedElapsed) / 1000;
        if (elapsed >= durationSec) { resolve(); return; }
        setTimeout(check, 100);
      };
      check();
    });
  }

  function togglePause() {
    if (!execState.running) return;
    if (execState.paused) {
      // Resume
      execState.pausedElapsed += Date.now() - execState.pauseStart;
      execState.paused = false;
      $('pause-btn').textContent = 'Pause';
      speechSynthesis.resume();
    } else {
      // Pause
      execState.paused = true;
      execState.pauseStart = Date.now();
      $('pause-btn').textContent = 'Resume';
      speechSynthesis.pause();
    }
  }

  function stopExecution() {
    execState.stopped = true;
    execState.running = false;
    if (execState.intervalId) clearInterval(execState.intervalId);
    if (execState.rafId) cancelAnimationFrame(execState.rafId);
    speechSynthesis.cancel();
    silentAudio.pause();
    silentAudio.currentTime = 0;
    showScreen(editorScreen);
  }

  function finishExecution() {
    execState.running = false;
    if (execState.intervalId) clearInterval(execState.intervalId);
    if (execState.rafId) cancelAnimationFrame(execState.rafId);
    silentAudio.pause();
    silentAudio.currentTime = 0;

    $('exec-timer').textContent = '0:00';
    $('exec-text').textContent = '';
    $('exec-position').innerHTML = '<span class="exec-done">Workout complete!</span>';
    $('exec-progress').style.width = '100%';
    $('exec-remaining').textContent = '';
    $('exec-controls').style.display = 'none';

    // Announce completion
    speakText('Workout complete. Well done!');

    // Return to editor after a delay
    setTimeout(() => {
      if (!execState.running) {
        showScreen(editorScreen);
      }
    }, 5000);
  }

  $('pause-btn').addEventListener('click', togglePause);
  $('stop-btn').addEventListener('click', stopExecution);

  // --- Init ---
  renderHome();

})();
