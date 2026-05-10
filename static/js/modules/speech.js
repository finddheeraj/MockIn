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
