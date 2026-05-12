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
  recognition.continuous     = true;
  recognition.interimResults = true;
  recognition.lang           = "en-US";

  let finalTranscript = "";
  let existingText    = "";

  recognition.onstart = () => {
    isListening = true;
    const input  = document.getElementById("answer-input");
    existingText    = input.value.trimEnd();
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
    const input  = document.getElementById("answer-input");
    const prefix = existingText ? existingText + " " : "";
    input.value  = prefix + finalTranscript + interim;
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
  if(!btn) return;
  btn.classList.toggle("active", ttsEnabled);
  btn.title = ttsEnabled ? "Narration ON - click to mute" : "Narration OFF - click to unmute";
}

export function toggleNarration() {
  ttsEnabled = !ttsEnabled;
  localStorage.setItem("tts-enabled", ttsEnabled);
  _updateSpeakerBtn();
  if(!ttsEnabled) window.speechSynthesis.cancel();
}

export function speakText(text) {
  if(!ttsEnabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.95;
  utter.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const preffered = voices.find(v => /Google US|Microsoft Mark| Microsoft David|Samantha/i.test(v.name))
                  || voices.find(v => v.lang.startsWith("en") && v.localService);

  if (preffered) {
    utter.voice = preffered;
  }

  window.speechSynthesis.speak(utter);
}

export function stopSpeaking() {
  if(window.speechSynthesis) window.speechSynthesis.cancel();
}

export function initNarration() {
  if(!window.speechSynthesis) {
    const btn = document.getElementById("btn-speaker");
    if(btn) btn.style.display = "none";
    return;
  }
  // Voices load async in some browsers
  window.speechSynthesis.onvoiceschanged = () => {};
  window.speechSynthesis.getVoices();
  _updateSpeakerBtn();
}


