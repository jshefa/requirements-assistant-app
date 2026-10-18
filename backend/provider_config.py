"""Shared AI provider settings for the prototype and research workflows."""

import json
import os
from pathlib import Path

SUPPORTED_PROVIDERS = ["anthropic", "openai", "ollama"]
PROVIDER_ENV_KEYS = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
}
MODEL_SETTINGS = {
    "anthropic": ("ANTHROPIC_MODEL", "claude-sonnet-4-5"),
    "openai": ("OPENAI_MODEL", "gpt-4o"),
    "ollama": ("OLLAMA_MODEL", "llama3"),
}

DATA_DIR = Path(__file__).parent / "data"
API_KEYS_FILE = DATA_DIR / "api_keys.json"


def get_provider() -> str:
    """Read AI_PROVIDER, defaulting to Anthropic."""
    return os.getenv("AI_PROVIDER", "anthropic").strip().lower()


def get_model(provider: str) -> str:
    """Return the model configured for a provider."""
    if provider not in MODEL_SETTINGS:
        raise ValueError(f"Unsupported AI provider: {provider}")
    env_name, default_model = MODEL_SETTINGS[provider]
    return os.getenv(env_name, default_model).strip() or default_model

def load_json_keys() -> dict:
    """Loads the api keys that have been saved in the /data/api_keys.json file. This is used
    so that the user can set their keys in the browser, then later retrieve them for AI calls."""
    if API_KEYS_FILE.exists():
        try:
            return json.loads(API_KEYS_FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
    return {}

def get_server_api_key(provider: str) -> str:
    """Research uses env keys; prototype uses the user-provided JSON keys."""
    key_env = PROVIDER_ENV_KEYS.get(provider)
    if not key_env:  # Ollama does not require an API key.
        return ""

    if os.getenv("APP_MODE", "prototype").strip().lower() == "research":
        return os.getenv(key_env, "").strip()
    else:
        return (load_json_keys().get(provider) or "").strip()

def get_provider_labels() -> dict:
    """Human-readable provider labels for the existing prototype configuration UI."""
    return {
        "anthropic": f"{os.getenv('ANTHROPIC_MODEL', 'Anthropic model')} (Anthropic)",
        "openai": f"{os.getenv('OPENAI_MODEL', 'OpenAI model')} (OpenAI)",
        "ollama": f"{os.getenv('OLLAMA_MODEL', 'Local model')} (Ollama)",
    }
