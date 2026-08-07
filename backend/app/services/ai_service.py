from __future__ import annotations

import json
from typing import Any, AsyncGenerator

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


class AIProvider:
    """Abstract base for AI model providers."""

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> str:
        raise NotImplementedError

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> AsyncGenerator[str, None]:
        raise NotImplementedError


class OllamaProvider(AIProvider):
    """Local Ollama provider — no API key needed."""

    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> str:
        payload = {"model": model or "llama3.2", "messages": messages, "stream": False}
        if system_prompt:
            payload["messages"] = [{"role": "system", "content": system_prompt}] + payload["messages"]

        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                resp = await client.post(f"{self.base_url}/api/chat", json=payload)
                resp.raise_for_status()
                data = resp.json()
                return data.get("message", {}).get("content", "")
            except httpx.HTTPError as e:
                logger.error("ollama_error", error=str(e))
                raise RuntimeError(f"Ollama API error: {e}")

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> AsyncGenerator[str, None]:
        payload = {"model": model or "llama3.2", "messages": messages, "stream": True}
        if system_prompt:
            payload["messages"] = [{"role": "system", "content": system_prompt}] + payload["messages"]

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.strip():
                        try:
                            chunk = json.loads(line)
                            content = chunk.get("message", {}).get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue


class OpenAIProvider(AIProvider):
    """OpenAI / Azure OpenAI provider."""

    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> str:
        formatted = messages
        if system_prompt:
            formatted = [{"role": "system", "content": system_prompt}] + formatted

        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        payload = {"model": model or "gpt-4o-mini", "messages": formatted}

        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/chat/completions", json=payload, headers=headers
                )
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
            except httpx.HTTPError as e:
                logger.error("openai_error", error=str(e))
                raise RuntimeError(f"OpenAI API error: {e}")

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> AsyncGenerator[str, None]:
        formatted = messages
        if system_prompt:
            formatted = [{"role": "system", "content": system_prompt}] + formatted

        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        payload = {"model": model or "gpt-4o-mini", "messages": formatted, "stream": True}

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST", f"{self.base_url}/chat/completions", json=payload, headers=headers
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: ") and line.strip() != "data: [DONE]":
                        try:
                            chunk = json.loads(line[6:])
                            content = chunk["choices"][0].get("delta", {}).get("content", "")
                            if content:
                                yield content
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue


class AnthropicProvider(AIProvider):
    """Anthropic Claude provider."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.ANTHROPIC_API_KEY
        self.base_url = "https://api.anthropic.com/v1"
        self.api_version = "2023-06-01"

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> str:
        system_list = None
        user_assistant_msgs = []
        for m in messages:
            role = m.get("role", "user")
            if role == "system":
                system_list = [{"type": "text", "text": m["content"]}]
            else:
                user_assistant_msgs.append({"role": role, "content": m["content"]})

        if system_prompt:
            system_list = [{"type": "text", "text": system_prompt}]

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": self.api_version,
            "Content-Type": "application/json",
        }
        payload = {
            "model": model or "claude-3-5-haiku-latest",
            "max_tokens": 4096,
            "messages": user_assistant_msgs,
        }
        if system_list:
            payload["system"] = system_list

        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                resp = await client.post(f"{self.base_url}/messages", json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                return data["content"][0]["text"]
            except httpx.HTTPError as e:
                logger.error("anthropic_error", error=str(e))
                raise RuntimeError(f"Anthropic API error: {e}")

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> AsyncGenerator[str, None]:
        system_list = None
        user_assistant_msgs = []
        for m in messages:
            role = m.get("role", "user")
            if role == "system":
                system_list = [{"type": "text", "text": m["content"]}]
            else:
                user_assistant_msgs.append({"role": role, "content": m["content"]})

        if system_prompt:
            system_list = [{"type": "text", "text": system_prompt}]

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": self.api_version,
            "Content-Type": "application/json",
        }
        payload = {
            "model": model or "claude-3-5-haiku-latest",
            "max_tokens": 4096,
            "messages": user_assistant_msgs,
            "stream": True,
        }
        if system_list:
            payload["system"] = system_list

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST", f"{self.base_url}/messages", json=payload, headers=headers
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: ") and line.strip() != "data: [DONE]":
                        try:
                            chunk = json.loads(line[6:])
                            if chunk.get("type") == "content_block_delta":
                                text = chunk.get("delta", {}).get("text", "")
                                if text:
                                    yield text
                        except (json.JSONDecodeError, KeyError):
                            continue


class AIService:
    """Unified AI service with automatic provider selection and fallback."""

    SECURITY_SYSTEM_PROMPT = (
        "You are ARGUS AI, an enterprise security operations AI assistant. "
        "You help SOC analysts investigate threats, explain alerts, generate detection rules, "
        "and recommend remediation actions. Always be precise about security findings, "
        "cite MITRE ATT&CK techniques where relevant, and note confidence levels. "
        "Never recommend actions that could cause harm without human approval. "
        "Always prioritize containment and evidence preservation."
    )

    def __init__(self):
        self._providers: dict[str, AIProvider] = {}
        self._init_providers()

    def _init_providers(self):
        self._providers["ollama"] = OllamaProvider()

        if settings.OPENAI_API_KEY and settings.OPENAI_API_KEY != "sk-change-me":
            self._providers["openai"] = OpenAIProvider()

        if settings.ANTHROPIC_API_KEY and settings.ANTHROPIC_API_KEY != "sk-ant-change-me":
            self._providers["anthropic"] = AnthropicProvider()

    def get_provider(self, provider: str | None = None) -> AIProvider:
        if provider and provider in self._providers:
            return self._providers[provider]
        available = list(self._providers.keys())
        if not available:
            raise RuntimeError("No AI providers configured. Set OLLAMA_BASE_URL, OPENAI_API_KEY, or ANTHROPIC_API_KEY.")
        return self._providers[available[0]]

    def list_providers(self) -> list[dict[str, Any]]:
        result = []
        if "ollama" in self._providers:
            result.append({"provider": "ollama", "models": ["llama3.2", "mistral", "qwen2.5", "deepseek-r1", "gemma3"], "available": True})
        if "openai" in self._providers:
            result.append({"provider": "openai", "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-mini"], "available": True})
        if "anthropic" in self._providers:
            result.append({"provider": "anthropic", "models": ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"], "available": True})
        if not result:
            result.append({"provider": "none", "models": [], "available": False, "message": "No AI providers configured"})
        return result

    async def chat(
        self,
        message: str,
        provider: str | None = None,
        model: str | None = None,
        agent_type: str = "general",
        history: list[dict[str, str]] | None = None,
    ) -> str:
        provider = self.get_provider(provider)
        messages = (history or []) + [{"role": "user", "content": message}]

        agent_prompts: dict[str, str] = {
            "soc_analyst": f"{self.SECURITY_SYSTEM_PROMPT} Focus on alert triage and investigation.",
            "threat_hunter": f"{self.SECURITY_SYSTEM_PROMPT} Focus on proactive threat hunting and pattern detection.",
            "malware_analyst": f"{self.SECURITY_SYSTEM_PROMPT} Focus on malware analysis and IOC extraction.",
            "detection_engineer": f"{self.SECURITY_SYSTEM_PROMPT} Focus on creating Sigma, YARA, and detection rules.",
            "dfir": f"{self.SECURITY_SYSTEM_PROMPT} Focus on digital forensics and incident response.",
            "executive": f"{self.SECURITY_SYSTEM_PROMPT} Focus on executive summaries and business impact.",
            "compliance": f"{self.SECURITY_SYSTEM_PROMPT} Focus on compliance frameworks and control mapping.",
        }
        system = agent_prompts.get(agent_type, self.SECURITY_SYSTEM_PROMPT)

        return await provider.chat(messages, model=model, system_prompt=system)

    async def investigate(self, query: str, context: dict | None = None) -> dict[str, Any]:
        """AI-powered security investigation."""
        prompt = f"""Investigate the following security query: {query}
        
Provide a structured response with:
1. Summary of findings
2. Supporting evidence
3. Affected assets
4. Related alerts/incidents
5. MITRE ATT&CK techniques
6. Confidence level (0-100)
7. Recommended investigation steps
8. Containment options

Format as JSON with keys: summary, evidence, affected_assets, related_alerts, related_incidents, mitre_techniques, confidence, recommended_steps, containment_options"""

        provider = self.get_provider()
        try:
            response = await provider.chat([{"role": "user", "content": prompt}], system_prompt=self.SECURITY_SYSTEM_PROMPT)
            try:
                result = json.loads(response)
            except json.JSONDecodeError:
                result = {
                    "summary": response[:500],
                    "evidence": [],
                    "affected_assets": [],
                    "related_alerts": [],
                    "related_incidents": [],
                    "mitre_techniques": [],
                    "confidence": 70,
                    "recommended_steps": ["Review the AI response manually"],
                    "containment_options": [],
                }
            return result
        except Exception as e:
            logger.error("investigate_error", error=str(e))
            return {
                "summary": f"Investigation of: {query}\n\nAI service unavailable: {str(e)}",
                "evidence": [], "affected_assets": [], "related_alerts": [], "related_incidents": [],
                "mitre_techniques": [], "confidence": 0, "recommended_steps": ["AI service unavailable"], "containment_options": [],
            }

    async def generate_sigma_rule(self, description: str, log_source: str | None = None, mitre_technique: str | None = None) -> dict[str, Any]:
        """Generate a Sigma detection rule."""
        prompt = f"""Generate a Sigma rule for the following detection: {description}
        Log source: {log_source or 'windows'}
        MITRE technique: {mitre_technique or 'TBD'}
        
        Return a valid Sigma YAML rule. Also include:
        - explanation of the rule
        - expected false positives
        - required log sources
        - MITRE ATT&CK mapping"""

        provider = self.get_provider()
        try:
            response = await provider.chat([{"role": "user", "content": prompt}], system_prompt=self.SECURITY_SYSTEM_PROMPT)
            return {
                "sigma_rule": response,
                "explanation": "Generated by AI. Review before deployment.",
                "false_positives": "May trigger on legitimate administrative activity.",
                "required_log_sources": [log_source or "windows"],
                "mitre_techniques": [mitre_technique or "TBD"],
            }
        except Exception as e:
            logger.error("sigma_generate_error", error=str(e))
            return {
                "sigma_rule": f"# AI generation failed: {e}\ntitle: {description}\nstatus: experimental",
                "explanation": f"AI service unavailable: {str(e)}",
                "false_positives": "Unknown",
                "required_log_sources": [],
                "mitre_techniques": [],
            }

    async def generate_yara_rule(self, description: str, target: str | None = None) -> dict[str, Any]:
        """Generate a YARA detection rule."""
        prompt = f"""Generate a YARA rule for: {description}
        Target: {target or 'malware'}
        Return a valid YARA rule with meta section and strings/condition."""

        provider = self.get_provider()
        try:
            response = await provider.chat([{"role": "user", "content": prompt}], system_prompt=self.SECURITY_SYSTEM_PROMPT)
            return {
                "yara_rule": response,
                "explanation": "Generated by AI. Review before deployment.",
                "false_positives": "May match benign files with similar patterns.",
            }
        except Exception as e:
            logger.error("yara_generate_error", error=str(e))
            return {
                "yara_rule": f"// AI generation failed: {e}\nrule {description.replace(' ', '_')} {{ condition: false }}",
                "explanation": f"AI service unavailable: {str(e)}",
                "false_positives": "Unknown",
            }


ai_service = AIService()
