"""
llm_client.py — LLM Client Factory
-------------------------------------
Provides clients for both Grok API and local Llama model.
Both expose the same interface so agents remain backend-agnostic.
Note: The local Llama model is NOT thread-safe, so access is serialized via a lock.
"""

import threading
from openai import OpenAI
from config import (
    XAI_API_KEY, XAI_BASE_URL,
    LOCAL_MODEL_PATH, LOCAL_MODEL_CONTEXT_SIZE, LOCAL_MODEL_GPU_LAYERS,
    LLM_PROVIDER,
)

# ── Singleton for the local model (expensive to load, reuse across requests) ─
_local_llm_instance = None
_local_llm_lock = threading.Lock()


def get_grok_client() -> OpenAI:
    """Returns a configured OpenAI-compatible client pointed at xAI's Grok API."""
    return OpenAI(
        api_key=XAI_API_KEY,
        base_url=XAI_BASE_URL,
    )


# Keep the old name as an alias for backward compatibility in imports
get_client = get_grok_client


class _ChatCompletionMessage:
    def __init__(self, content):
        self.content = content


class _ChatCompletionChoice:
    def __init__(self, message):
        self.message = message


class _ChatCompletionResponse:
    def __init__(self, choices):
        self.choices = choices


class _LocalCompletions:
    """Wraps llama-cpp-python's create_chat_completion to match OpenAI's interface.
    Uses a lock to prevent concurrent access (llama-cpp is not thread-safe)."""

    def __init__(self, llm):
        self._llm = llm

    def create(self, model=None, messages=None, max_tokens=256, temperature=0.7, **kwargs):
        with _local_llm_lock:
            result = self._llm.create_chat_completion(
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        content = result["choices"][0]["message"]["content"]
        return _ChatCompletionResponse(
            choices=[_ChatCompletionChoice(_ChatCompletionMessage(content))]
        )


class _LocalChat:
    def __init__(self, llm):
        self.completions = _LocalCompletions(llm)


class LocalLLMClient:
    """
    Wraps the llama-cpp-python Llama instance to expose the same
    client.chat.completions.create() interface as the OpenAI SDK.
    """

    def __init__(self, llm):
        self.chat = _LocalChat(llm)


def get_local_client() -> LocalLLMClient:
    """
    Returns a LocalLLMClient backed by the GGUF model.
    The underlying Llama instance is loaded once and reused (singleton).
    """
    global _local_llm_instance

    if _local_llm_instance is None:
        from llama_cpp import Llama
        _local_llm_instance = Llama(
            model_path=LOCAL_MODEL_PATH,
            n_ctx=LOCAL_MODEL_CONTEXT_SIZE,
            n_gpu_layers=LOCAL_MODEL_GPU_LAYERS,
            verbose=False,
        )

    return LocalLLMClient(_local_llm_instance)


def get_clients() -> dict:
    """
    Returns a dict of active clients based on LLM_PROVIDER setting.
    Keys: "grok" and/or "local".
    """
    clients = {}
    if LLM_PROVIDER in ("grok", "both"):
        clients["grok"] = get_grok_client()
    if LLM_PROVIDER in ("local", "both"):
        clients["local"] = get_local_client()
    return clients
