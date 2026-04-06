// =============================================================
// Piper TTS — self-hosted wrapper for Stigs Timed Trainer
// Loads phonemizer WASM + ONNX Runtime + voice model from piper/
// Exposes window.PiperTTS = { init, speak, ready }
// =============================================================

// Resolve base URL relative to this module's location
const MODULE_BASE = new URL('.', import.meta.url).href;
// For fetch() calls from the page context, use path relative to page root
const PIPER_BASE = './piper';

let ort = null;
let createPiperPhonemize = null;
let phonemizer = null;
let voiceConfigs = {};    // voiceId -> parsed JSON config
let voiceSessions = {};   // voiceId -> ONNX InferenceSession
let initPromise = null;
let _ready = false;

// WAV encoder (PCM 16-bit mono)
function encodeWav(samples, sampleRate) {
  const numSamples = samples.length;
  const headerSize = 44;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);
  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, buffer.byteLength - 8, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);
  let offset = headerSize;
  for (let i = 0; i < numSamples; i++) {
    const s = samples[i];
    const clamped = s >= 1 ? 32767 : s <= -1 ? -32768 : (s * 32768) | 0;
    view.setInt16(offset, clamped, true);
    offset += 2;
  }
  return buffer;
}

async function loadOrt() {
  if (ort) return ort;
  // import() resolves relative to this module's URL
  ort = await import(`${MODULE_BASE}ort.min.js`);
  ort.env.allowLocalModels = false;
  ort.env.wasm.numThreads = navigator.hardwareConcurrency;
  // wasmPaths used by ONNX Runtime to find .wasm files — relative to page
  ort.env.wasm.wasmPaths = `${PIPER_BASE}/`;
  return ort;
}

async function loadPhonemizer() {
  if (phonemizer) return phonemizer;
  const mod = await import(`${MODULE_BASE}piper-DeOu3H9E.js`);
  // Store the factory — we create a fresh instance per speak() call
  // because callMain + print callback is single-use
  phonemizer = mod.createPiperPhonemize;
  return phonemizer;
}

async function loadVoice(voiceId) {
  if (voiceSessions[voiceId]) return;
  await loadOrt();
  // Load config
  const configResp = await fetch(`${PIPER_BASE}/voices/${voiceId}.onnx.json`);
  voiceConfigs[voiceId] = await configResp.json();
  // Load model
  const modelResp = await fetch(`${PIPER_BASE}/voices/${voiceId}.onnx`);
  const modelBuffer = await modelResp.arrayBuffer();
  voiceSessions[voiceId] = await ort.InferenceSession.create(modelBuffer);
}

async function init(voiceId) {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // Load ONNX Runtime and phonemizer factory in parallel, then load voice model
    await Promise.all([
      loadOrt(),
      loadPhonemizer()
    ]);
    await loadVoice(voiceId);
    _ready = true;
  })();
  return initPromise;
}

async function switchVoice(voiceId) {
  if (!voiceSessions[voiceId]) {
    await loadVoice(voiceId);
  }
}

async function speak(text, voiceId) {
  if (!_ready) throw new Error('PiperTTS not initialized');
  if (!voiceSessions[voiceId]) await loadVoice(voiceId);

  const config = voiceConfigs[voiceId];
  const session = voiceSessions[voiceId];
  const inputJson = JSON.stringify([{ text: text.trim() }]);

  // Phonemize — create instance with print callback (matches vits-web approach)
  const phonemeIds = await new Promise(async (resolve) => {
    const ph = await phonemizer({
      print: (msg) => { resolve(JSON.parse(msg).phoneme_ids); },
      printErr: (msg) => { throw new Error(msg); },
      locateFile: (file) => {
        if (file.endsWith('.wasm')) return `${PIPER_BASE}/piper_phonemize.wasm`;
        if (file.endsWith('.data')) return `${PIPER_BASE}/piper_phonemize.data`;
        return file;
      }
    });
    ph.callMain([
      '-l', config.espeak.voice,
      '--input', inputJson,
      '--espeak_data', '/espeak-ng-data'
    ]);
  });

  // Run inference
  const noiseScale = config.inference.noise_scale;
  const lengthScale = config.inference.length_scale;
  const noiseW = config.inference.noise_w;
  const sampleRate = config.audio.sample_rate;

  const feeds = {
    input: new ort.Tensor('int64', phonemeIds, [1, phonemeIds.length]),
    input_lengths: new ort.Tensor('int64', [phonemeIds.length]),
    scales: new ort.Tensor('float32', [noiseScale, lengthScale, noiseW])
  };
  if (Object.keys(config.speaker_id_map || {}).length > 0) {
    feeds.sid = new ort.Tensor('int64', [0]);
  }

  const { output: { data: audioData } } = await session.run(feeds);

  // Encode to WAV ArrayBuffer
  return encodeWav(audioData, sampleRate);
}

// Expose globally for use from non-module scripts
window.PiperTTS = {
  init,
  switchVoice,
  speak,
  get ready() { return _ready; },
  voices: {
    'en_US-hfc_female-medium': 'HD Female',
    'en_US-hfc_male-medium': 'HD Male'
  }
};
