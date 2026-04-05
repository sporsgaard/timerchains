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
  const homeHelpScreen = $('home-help-screen');
  const editorHelpScreen = $('editor-help-screen');
  const workoutListEl = $('workout-list');
  const workoutNameEl = $('workout-name');
  const blockTreeEl = $('block-tree');
  const silentAudio = $('silent-audio');

  // --- State ---
  let workouts = [];       // Array of { id, name, blocks }
  let currentWorkout = null; // The workout being edited
  let editorBlocks = null;   // Root group block for editor
  let editorReadOnly = false; // True when viewing a template
  let templates = [];        // Cached templates: Array of { name, blocks }

  // --- Storage ---
  function loadWorkouts() {
    try {
      workouts = JSON.parse(localStorage.getItem('workouts')) || [];
    } catch { workouts = []; }
  }

  function saveWorkouts() {
    localStorage.setItem('workouts', JSON.stringify(workouts));
  }

  // --- Templates ---
  function loadTemplatesFromCache() {
    try {
      templates = JSON.parse(localStorage.getItem('templates')) || [];
    } catch { templates = []; }
  }

  function saveTemplatesToCache() {
    localStorage.setItem('templates', JSON.stringify(templates));
  }

  async function fetchTemplates() {
    try {
      const indexResp = await fetch('templates/index.json');
      if (!indexResp.ok) throw new Error('Failed to fetch template index');
      const index = await indexResp.json();
      const fetched = [];
      for (const entry of index) {
        const yamlResp = await fetch('templates/' + entry.file);
        if (!yamlResp.ok) continue;
        const yamlText = await yamlResp.text();
        const parsed = jsyaml.load(yamlText);
        if (parsed && parsed.name && parsed.blocks) {
          fetched.push({ name: parsed.name, blocks: parsed.blocks });
        }
      }
      templates = fetched;
      saveTemplatesToCache();
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    }
  }

  // --- Unique Name Generation ---
  function generateCopyName(originalName) {
    const baseName = originalName || 'Untitled';
    const existingNames = new Set(workouts.map(w => w.name));
    const candidate = baseName + ' (copy)';
    if (!existingNames.has(candidate)) return candidate;
    for (let i = 2; ; i++) {
      const numbered = baseName + ' (copy ' + i + ')';
      if (!existingNames.has(numbered)) return numbered;
    }
  }

  // --- Copy Workout ---
  let copyInProgress = false;

  function copyWorkout(name, blocks) {
    if (copyInProgress) return null;
    copyInProgress = true;
    try {
      loadWorkouts();
      const newName = generateCopyName(name);
      const newWorkout = {
        id: Date.now(),
        name: newName,
        blocks: JSON.parse(JSON.stringify(blocks))
      };
      workouts.push(newWorkout);
      saveWorkouts();
      return newWorkout;
    } finally {
      copyInProgress = false;
    }
  }

  function renderTemplateList() {
    const listEl = $('template-list');
    listEl.innerHTML = '';
    if (templates.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text2);font-size:14px;padding:8px 0;">No templates available.</div>';
      return;
    }
    templates.forEach(t => {
      const item = document.createElement('div');
      item.className = 'template-item';
      item.innerHTML = '<span class="name">' + esc(t.name) + '</span>'
        + '<button class="copy-btn" title="Copy to my workouts">&#x29C9;</button>';
      item.querySelector('.name').addEventListener('click', () => openTemplateEditor(t));
      item.querySelector('.copy-btn').addEventListener('click', e => {
        e.stopPropagation();
        const newWorkout = copyWorkout(t.name, t.blocks);
        if (newWorkout) openEditor(newWorkout);
      });
      listEl.appendChild(item);
    });
  }

  $('refresh-templates-btn').addEventListener('click', async () => {
    const btn = $('refresh-templates-btn');
    btn.disabled = true;
    btn.textContent = '...';
    await fetchTemplates();
    renderTemplateList();
    btn.disabled = false;
    btn.textContent = '\u21BB';
  });

  // --- Screen Navigation ---
  function showScreen(screen) {
    [homeScreen, editorScreen, execScreen, homeHelpScreen, editorHelpScreen].forEach(s => s.classList.remove('active'));
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
          <button class="copy-btn" title="Copy">&#x29C9;</button>
          <button class="delete-btn" data-id="${w.id}" title="Delete">&times;</button>`;
        item.querySelector('.name').addEventListener('click', () => openEditor(w));
        item.querySelector('.copy-btn').addEventListener('click', e => {
          e.stopPropagation();
          const newWorkout = copyWorkout(w.name || 'Untitled', w.blocks);
          if (newWorkout) openEditor(newWorkout);
        });
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
  function setEditorMode(readOnly) {
    editorReadOnly = readOnly;
    const content = editorScreen.querySelector('.editor-content');
    if (readOnly) {
      content.classList.add('editor-readonly');
      $('editor-title').textContent = 'Template';
      $('save-btn').style.display = 'none';
      $('copy-btn').style.display = '';
      workoutNameEl.disabled = true;
    } else {
      content.classList.remove('editor-readonly');
      $('editor-title').textContent = 'Edit Workout';
      $('save-btn').style.display = '';
      $('copy-btn').style.display = 'none';
      workoutNameEl.disabled = false;
    }
  }

  function openEditor(workout) {
    setEditorMode(false);
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

  function openTemplateEditor(template) {
    setEditorMode(true);
    currentWorkout = null;
    editorBlocks = JSON.parse(JSON.stringify(template.blocks));
    workoutNameEl.value = template.name;
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
      li.draggable = !editorReadOnly;
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
            <button class="preview-btn" title="Preview sound">&#9834;</button>
            <button class="del-btn">Delete</button>
          </div>
          <div class="block-actions-readonly">
            <button class="preview-btn" title="Preview sound">&#9834;</button>
          </div>
        </div>`;

        li.querySelector('[data-field="text"]').addEventListener('input', e => { block.text = e.target.value; });
        li.querySelector('[data-field="duration"]').addEventListener('input', e => { block.duration = Math.max(1, parseInt(e.target.value) || 1); });
        li.querySelector('[data-field="repeat"]').addEventListener('input', e => { block.repeat = Math.min(99, Math.max(1, parseInt(e.target.value) || 1)); });

        // Preview button(s)
        li.querySelectorAll('.preview-btn').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var text = block.text || '';
            // Build context from ancestor groups
            var ctx = buildPreviewContext(li);
            text = substituteVars(text, ctx);
            var segments = parseTextSegments(text);
            if (segments.length > 0) playSegmentsPreview(segments);
          });
        });
      } else {
        li.innerHTML = `<div class="block-card group-card">
          <div class="group-header">
            <span class="drag-handle">⠿</span>
            <span class="group-label">${esc(block.name || 'Group')}</span>
            <label style="font-weight:normal">&times;<input type="number" min="1" max="99" value="${block.repeat}" data-field="repeat" style="width:70px;margin-left:2px"></label>
            <label style="font-weight:normal;font-size:13px;color:var(--text2)">Var:<input type="text" maxlength="1" value="${esc(block.letter || '')}" data-field="letter" class="group-letter-input"></label>
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
        if (editorReadOnly) { groupLabel.style.cursor = 'default'; groupLabel.style.borderBottom = 'none'; }
        groupLabel.addEventListener('click', () => {
          if (editorReadOnly) return;
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
        card.querySelector('[data-field="letter"]').addEventListener('input', e => {
          var val = e.target.value.toLowerCase().replace(/[^a-z]/g, '');
          e.target.value = val;
          block.letter = val || undefined;
        });
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
        if (block.type !== 'leaf') {
          if (!confirm('Delete group "' + (block.name || 'Group') + '"?')) return;
        }
        blocks.splice(idx, 1);
        renderBlockTree();
      });

      // Disable all inputs in read-only mode
      if (editorReadOnly) {
        li.querySelectorAll('input').forEach(inp => { inp.disabled = true; });
      }

      // Drag & drop
      if (!editorReadOnly) {
        setupDrag(li, blocks, idx, parentUl);
      }

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

  // --- Save validation ---
  function collectDefinedLetters(block) {
    var letters = new Set();
    if (block.type === 'group') {
      if (block.letter) letters.add(block.letter);
      (block.blocks || []).forEach(function (child) {
        collectDefinedLetters(child).forEach(function (l) { letters.add(l); });
      });
    }
    return letters;
  }

  function collectReferencedLetters(block) {
    var letters = new Set();
    if (block.type === 'leaf') {
      var m;
      var re = /\{[#%~]?([a-z])\}/g;
      while ((m = re.exec(block.text || '')) !== null) {
        letters.add(m[1]);
      }
    } else if (block.type === 'group') {
      (block.blocks || []).forEach(function (child) {
        collectReferencedLetters(child).forEach(function (l) { letters.add(l); });
      });
    }
    return letters;
  }

  function validateVarReferences(rootBlock) {
    var defined = collectDefinedLetters(rootBlock);
    var referenced = collectReferencedLetters(rootBlock);
    var undefined_ = [];
    referenced.forEach(function (l) {
      if (!defined.has(l)) undefined_.push(l);
    });
    return undefined_;
  }

  // --- Save ---
  $('save-btn').addEventListener('click', () => {
    const name = workoutNameEl.value.trim() || 'Untitled';

    // Validate variable references
    var undefinedVars = validateVarReferences(editorBlocks);
    if (undefinedVars.length > 0) {
      alert('Warning: Variable(s) {' + undefinedVars.join('}, {') + '} referenced in text but no ancestor group defines them.');
    }

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

  $('copy-btn').addEventListener('click', () => {
    const name = workoutNameEl.value.trim() || 'Untitled';
    const newWorkout = copyWorkout(name, editorBlocks);
    if (newWorkout) {
      renderHome();
      openEditor(newWorkout);
    }
  });

  $('editor-back').addEventListener('click', () => {
    showScreen(homeScreen);
    renderHome();
  });

  // --- Preview helpers ---
  function buildPreviewContext(leafLi) {
    // Walk up the DOM to find ancestor group cards and collect their letters
    var ctx = {};
    var el = leafLi.parentElement;
    while (el) {
      if (el.classList && el.classList.contains('block-card') && el.classList.contains('group-card')) {
        var letterInput = el.querySelector(':scope > .group-header > label > [data-field="letter"]');
        var repeatInput = el.querySelector(':scope > .group-header > label > [data-field="repeat"]');
        if (letterInput && letterInput.value) {
          var letter = letterInput.value.toLowerCase();
          var total = parseInt(repeatInput ? repeatInput.value : 1) || 1;
          // Only set if not already set by a closer ancestor (inner shadows outer)
          if (!ctx[letter]) {
            ctx[letter] = { current: 1, total: total };
          }
        }
      }
      el = el.parentElement;
    }
    return ctx;
  }

  // Separate playSegments for preview that doesn't check execState.stopped
  async function playSegmentsPreview(segments) {
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (seg.type === 'beep') {
        await playBeep(seg.duration);
      } else if (seg.type === 'rising') {
        await playRisingTone();
      } else if (seg.type === 'falling') {
        await playFallingTone();
      } else if (seg.type === 'buzzer') {
        await playBuzzer();
      } else {
        await speakText(seg.text);
      }
    }
  }

  // --- Variable substitution ---
  function substituteVars(text, context) {
    return text.replace(/\{([#%~]?)([a-z])\}/g, function (match, modifier, letter) {
      var info = context[letter];
      if (!info) return match;
      switch (modifier) {
        case '': return info.current;
        case '#': return info.total;
        case '%': return info.total - info.current + 1;
        case '~': {
          var remaining = info.total - info.current;
          return remaining > 0 ? remaining : '';
        }
      }
      return match;
    });
  }

  // --- Flatten blocks for execution ---
  function flattenBlocks(block, context) {
    var ctx = context || {};
    var steps = [];
    if (block.type === 'leaf') {
      for (var r = 0; r < (block.repeat || 1); r++) {
        steps.push({ text: substituteVars(block.text || '', ctx), duration: block.duration || 1 });
      }
    } else if (block.type === 'group') {
      var total = block.repeat || 1;
      for (var r = 0; r < total; r++) {
        var innerCtx = Object.assign({}, ctx);
        if (block.letter) {
          innerCtx[block.letter] = { current: r + 1, total: total };
        }
        for (var ci = 0; ci < (block.blocks || []).length; ci++) {
          steps.push.apply(steps, flattenBlocks(block.blocks[ci], innerCtx));
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

  function playRisingTone() {
    return new Promise(resolve => {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.4);
      gain.gain.value = 0.5;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
      osc.onended = resolve;
    });
  }

  function playFallingTone() {
    return new Promise(resolve => {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.4);
      gain.gain.value = 0.5;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
      osc.onended = resolve;
    });
  }

  function playBuzzer() {
    return new Promise(resolve => {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 440;
      gain.gain.value = 0.5;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
      osc.onended = resolve;
    });
  }

  // --- TTS + Beep parsing ---
  function parseTextSegments(text) {
    if (!text) return [];
    // Split on sound tokens: asterisk groups (\*+) and individual ^, v, !
    const parts = text.trim().split(/(\*+|[\^v!])/);
    const segments = [];

    for (const part of parts) {
      if (/^\*+$/.test(part)) {
        const stars = part.length;
        const ms = stars === 1 ? 200 : stars === 2 ? 400 : 700;
        segments.push({ type: 'beep', duration: ms });
      } else if (part === '^') {
        segments.push({ type: 'rising' });
      } else if (part === 'v') {
        segments.push({ type: 'falling' });
      } else if (part === '!') {
        segments.push({ type: 'buzzer' });
      } else {
        const trimmed = part.trim();
        if (trimmed) segments.push({ type: 'speech', text: trimmed });
      }
    }
    return segments;
  }

  // --- SAM TTS (plays through Web Audio API for background support) ---
  const sam = new SamJs({ speed: 75, pitch: 64, mouth: 128, throat: 128 });

  function speakText(text) {
    return new Promise(resolve => {
      if (!text) { resolve(); return; }
      try {
        const samples = sam.buf32(text);
        if (!samples || samples.length === 0) { resolve(); return; }
        const ctx = getAudioCtx();
        const buffer = ctx.createBuffer(1, samples.length, 22050);
        buffer.getChannelData(0).set(samples);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = resolve;
        source.start();
      } catch (e) {
        resolve();
      }
    });
  }

  async function playSegments(segments) {
    for (const seg of segments) {
      if (execState.stopped) return;
      if (seg.type === 'beep') {
        await playBeep(seg.duration);
      } else if (seg.type === 'rising') {
        await playRisingTone();
      } else if (seg.type === 'falling') {
        await playFallingTone();
      } else if (seg.type === 'buzzer') {
        await playBuzzer();
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
    if (!editorReadOnly) {
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
    }

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
    // SAM plays through Web Audio — no global cancel needed // cut off any lingering speech

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
      // SAM audio resumes via AudioContext
    } else {
      // Pause
      execState.paused = true;
      execState.pauseStart = Date.now();
      $('pause-btn').textContent = 'Resume';
      // SAM audio pauses via AudioContext
    }
  }

  function stopExecution() {
    execState.stopped = true;
    execState.running = false;
    if (execState.intervalId) clearInterval(execState.intervalId);
    if (execState.rafId) cancelAnimationFrame(execState.rafId);
    // SAM plays through Web Audio — no global cancel needed
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

  // --- Help Screens ---
  $('home-help-btn').addEventListener('click', () => showScreen(homeHelpScreen));
  $('home-help-back').addEventListener('click', () => { showScreen(homeScreen); renderHome(); });
  $('editor-help-btn').addEventListener('click', () => showScreen(editorHelpScreen));
  $('editor-help-back').addEventListener('click', () => showScreen(editorScreen));

  // --- Init ---
  renderHome();

  // Load templates from cache, auto-fetch if not cached yet
  loadTemplatesFromCache();
  if (templates.length === 0 && !localStorage.getItem('templates')) {
    fetchTemplates().then(() => renderTemplateList());
  } else {
    renderTemplateList();
  }

})();
