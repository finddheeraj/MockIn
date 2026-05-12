/**
 * speech.js
 * ──────────
 * Wraps the Web Speech API. Exposes only two public functions:
 *   - initSpeechRecognition()  — call once on page load
 *   - toggleSpeech()           — bound to the mic button
 * Depends on: ui.js (showToast, updateCharCount)
 */

import { showToast, updateCharCount } from "./ui.js";

let recognition = null;
let isListening = false;

export function initSpeechRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    document.getElementById("btn-mic").style.display = "none";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  let finalTranscript = "";
  let existingText = "";

  recognition.onstart = () => {
    isListening = true;
    const input = document.getElementById("answer-input");
    existingText = input.value.trimEnd();
    finalTranscript = "";
    document.getElementById("btn-mic").classList.add("listening");
    document.getElementById("mic-pulse").style.display = "block";
    document.getElementById("speech-status").textContent = "Listening…";
  };

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + " ";
      } else {
        interim += transcript;
      }
    }
    const input = document.getElementById("answer-input");
    const prefix = existingText ? existingText + " " : "";
    input.value = prefix + finalTranscript + interim;
    updateCharCount(input);
  };

  recognition.onend = () => {
    isListening = false;
    document.getElementById("btn-mic").classList.remove("listening");
    document.getElementById("mic-pulse").style.display = "none";
    document.getElementById("speech-status").textContent = "";
  };

  recognition.onerror = (event) => {
    if (event.error === "not-allowed") {
      showToast("Microphone access denied. Check browser permissions.");
    } else if (event.error !== "aborted") {
      showToast("Speech error: " + event.error);
    }
    isListening = false;
    document.getElementById("btn-mic").classList.remove("listening");
    document.getElementById("mic-pulse").style.display = "none";
    document.getElementById("speech-status").textContent = "";
  };
}

export function toggleSpeech() {
  if (!recognition) {
    showToast("Speech recognition not supported in this browser.");
    return;
  }
  if (isListening) {
    recognition.stop();
  } else {
    recognition.start();
  }
}


/*------Text to speech (narration)------*/

let ttsEnabled = localStorage.getItem("tts-enabled") === "true";

function _updateSpeakerBtn() {
  const btn = document.getElementById("btn-speaker");
  if (!btn) return;
  btn.classList.toggle("active", ttsEnabled);
  btn.title = ttsEnabled ? "Narration ON - click to mute" : "Narration OFF - click to unmute";
}

export function toggleNarration() {
  ttsEnabled = !ttsEnabled;
  localStorage.setItem("tts-enabled", ttsEnabled);
  _updateSpeakerBtn();
  if (!ttsEnabled) window.speechSynthesis.cancel();
}

export function speakText(text, onWord) {
  if (!ttsEnabled || !window.speechSynthesis) {
    if (onWord) _revealWordsWithoutAudio(text, onWord);
    return;
  }
  window.speechSynthesis.cancel();

  setTimeout(() => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate  = 0.88;
    utter.pitch = 1.05;

    const voices    = window.speechSynthesis.getVoices();
    const preferred =
      voices.find(v => /Google US English/i.test(v.name))
      || voices.find(v => /Microsoft (Guy|Ryan|Jenny)/i.test(v.name))
      || voices.find(v => /Samantha/i.test(v.name))
      || voices.find(v => v.lang === "en-US" && !v.localService)
      || voices.find(v => v.lang.startsWith("en"));
    if (preferred) utter.voice = preferred;

    if (onWord) {
      const words = text.split(" ");
      // Estimate ms per word based on rate — ~130wpm at rate 1.0, scaled by utter.rate
      const msPerWord = (60000 / 130) / utter.rate;  // ~524ms per word at rate 0.88
      let wordIndex   = 0;
      let interval    = null;

      utter.onstart = () => {
        wordIndex = 0;
        interval  = setInterval(() => {
          wordIndex++;
          onWord(words.slice(0, wordIndex).join(" "));
          if (wordIndex >= words.length) clearInterval(interval);
        }, msPerWord);
      };

      utter.onend = () => {
        clearInterval(interval);
        onWord(text); // guarantee full text shown
      };

      utter.onerror = () => {
        clearInterval(interval);
        onWord(text);
      };
    }

    window.speechSynthesis.speak(utter);
  }, 600);
}

// Fallback: reveal words visually even when TTS is off
function _revealWordsWithoutAudio(text, onWord) {
  const words = text.split(" ");
  let i = 0;
  const interval = setInterval(() => {
    i++;
    onWord(words.slice(0, i).join(" "));
    if (i >= words.length) clearInterval(interval);
  }, 120);
}

export function stopSpeaking() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

export function initNarration() {
  if (!window.speechSynthesis) {
    const btn = document.getElementById("btn-speaker");
    if (btn) btn.style.display = "none";
    return;
  }
  // Voices load async in some browsers
  window.speechSynthesis.onvoiceschanged = () => { };
  window.speechSynthesis.getVoices();
  _updateSpeakerBtn();
}


