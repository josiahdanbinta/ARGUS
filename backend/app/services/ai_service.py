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


class OpenCodeProvider(AIProvider):
    """OpenCode Go — OpenAI-compatible endpoint, Bearer auth with an opencode API key."""

    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key or settings.OPENCODE_API_KEY
        self.base_url = (base_url or settings.OPENCODE_BASE_URL).rstrip("/")

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> str:
        formatted = messages
        if system_prompt:
            formatted = [{"role": "system", "content": system_prompt}] + formatted

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {"model": model or settings.OPENCODE_MODEL, "messages": formatted}

        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/chat/completions", json=payload, headers=headers
                )
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
            except httpx.HTTPError as e:
                logger.error("opencode_error", error=str(e))
                raise RuntimeError(f"OpenCode API error: {e}")

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> AsyncGenerator[str, None]:
        formatted = messages
        if system_prompt:
            formatted = [{"role": "system", "content": system_prompt}] + formatted

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {"model": model or settings.OPENCODE_MODEL, "messages": formatted, "stream": True}

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


class AzureOpenAIProvider(AIProvider):
    """Azure OpenAI provider (OpenAI-compatible API with api-key header)."""

    def __init__(self, api_key: str | None = None, endpoint: str | None = None, deployment: str | None = None):
        self.api_key = api_key or settings.AZURE_OPENAI_API_KEY
        self.endpoint = (endpoint or settings.AZURE_OPENAI_ENDPOINT).rstrip("/")
        self.deployment = deployment or settings.AZURE_OPENAI_DEPLOYMENT or settings.AZURE_OPENAI_MODEL
        self.api_version = settings.AZURE_OPENAI_API_VERSION

    def _url(self) -> str:
        return f"{self.endpoint}/openai/deployments/{self.deployment}/chat/completions?api-version={self.api_version}"

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> str:
        formatted = messages
        if system_prompt:
            formatted = [{"role": "system", "content": system_prompt}] + formatted

        headers = {
            "api-key": self.api_key,
            "Content-Type": "application/json",
        }
        payload = {"messages": formatted}

        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                resp = await client.post(self._url(), json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
            except httpx.HTTPError as e:
                logger.error("azure_openai_error", error=str(e))
                raise RuntimeError(f"Azure OpenAI API error: {e}")

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> AsyncGenerator[str, None]:
        formatted = messages
        if system_prompt:
            formatted = [{"role": "system", "content": system_prompt}] + formatted

        headers = {
            "api-key": self.api_key,
            "Content-Type": "application/json",
        }
        payload = {"messages": formatted, "stream": True}

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", self._url(), json=payload, headers=headers) as resp:
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


class GroqProvider(AIProvider):
    """Groq provider (OpenAI-compatible, fast inference)."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.GROQ_API_KEY
        self.base_url = "https://api.groq.com/openai/v1"

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
        payload = {"model": model or settings.GROQ_MODEL, "messages": formatted}

        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/chat/completions", json=payload, headers=headers
                )
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
            except httpx.HTTPError as e:
                logger.error("groq_error", error=str(e))
                raise RuntimeError(f"Groq API error: {e}")

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
        payload = {"model": model or settings.GROQ_MODEL, "messages": formatted, "stream": True}

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
        if settings.OPENCODE_API_KEY and settings.OPENCODE_API_KEY != "sk-change-me":
            self._providers["opencode"] = OpenCodeProvider()

        self._providers["ollama"] = OllamaProvider()

        if settings.OPENAI_API_KEY and settings.OPENAI_API_KEY != "sk-change-me":
            self._providers["openai"] = OpenAIProvider()

        if settings.AZURE_OPENAI_API_KEY and settings.AZURE_OPENAI_ENDPOINT:
            self._providers["azure_openai"] = AzureOpenAIProvider()

        if settings.GROQ_API_KEY:
            self._providers["groq"] = GroqProvider()

        if settings.ANTHROPIC_API_KEY and settings.ANTHROPIC_API_KEY != "sk-ant-change-me":
            self._providers["anthropic"] = AnthropicProvider()

    def get_provider(self, provider: str | None = None) -> AIProvider:
        if provider and provider in self._providers:
            return self._providers[provider]
        available = list(self._providers.keys())
        if not available:
            raise RuntimeError("No AI providers configured. Set OPENCODE_API_KEY, OLLAMA_BASE_URL, OPENAI_API_KEY, or ANTHROPIC_API_KEY.")
        if "opencode" in self._providers:
            return self._providers["opencode"]
        return self._providers[available[0]]

    def list_providers(self) -> list[dict[str, Any]]:
        result = []
        if "opencode" in self._providers:
            result.append({
                "provider": "opencode",
                "models": [settings.OPENCODE_MODEL, "deepseek-v4-pro", "glm-5.2", "kimi-k3", "grok-4.5"],
                "available": True,
            })
        if "ollama" in self._providers:
            result.append({"provider": "ollama", "models": ["llama3.2", "mistral", "qwen2.5", "deepseek-r1", "gemma3"], "available": True})
        if "openai" in self._providers:
            result.append({"provider": "openai", "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-mini"], "available": True})
        if "azure_openai" in self._providers:
            result.append({"provider": "azure_openai", "models": [settings.AZURE_OPENAI_DEPLOYMENT or settings.AZURE_OPENAI_MODEL], "available": True})
        if "groq" in self._providers:
            result.append({"provider": "groq", "models": [settings.GROQ_MODEL, "llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"], "available": True})
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

        return await self.chat_with_fallback(
            messages, provider=provider, model=model, system_prompt=system
        )

    async def chat_with_fallback(
        self,
        messages: list[dict[str, str]],
        provider: str | None = None,
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> str:
        """Try the requested (or preferred) provider first, then fall back to any other configured provider."""
        providers = list(self._providers.keys())

        if provider and provider in self._providers:
            preferred = [provider]
            rest = [p for p in providers if p != provider]
        elif "opencode" in providers:
            preferred = ["opencode"]
            rest = [p for p in providers if p != "opencode"]
        else:
            preferred = providers[:1]
            rest = providers[1:]

        order = preferred + rest
        errors: list[str] = []

        for prov_name in order:
            prov = self._providers[prov_name]
            try:
                logger.info("ai_provider_attempt", provider=prov_name)
                return await prov.chat(messages, model=model, system_prompt=system_prompt)
            except Exception as e:
                logger.warning("ai_provider_failed", provider=prov_name, error=str(e))
                errors.append(f"{prov_name}: {e}")

        raise RuntimeError("All AI providers failed: " + "; ".join(errors))

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

        try:
            response = await self.chat_with_fallback(
                [{"role": "user", "content": prompt}], system_prompt=self.SECURITY_SYSTEM_PROMPT
            )
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

        try:
            response = await self.chat_with_fallback(
                [{"role": "user", "content": prompt}], system_prompt=self.SECURITY_SYSTEM_PROMPT
            )
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

        try:
            response = await self.chat_with_fallback(
                [{"role": "user", "content": prompt}], system_prompt=self.SECURITY_SYSTEM_PROMPT
            )
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
