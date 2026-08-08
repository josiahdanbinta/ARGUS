from __future__ import annotations

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

RANSOMWARE_RULES = [
    {
        "id": "ransom-001",
        "name": "Mass File Encryption Extension Detection",
        "description": "Detects creation of known ransomware encrypted-file extensions (.locked, .encrypted, .crypt, .lockbit, .revil, .enc) indicating possible mass file encryption.",
        "severity": "critical",
        "mitre_techniques": ["T1486"],
        "patterns": [
            ".locked", ".encrypted", ".crypt", ".lockbit", ".revil",
            ".enc", ".rzv", ".onion", ".pay", ".wannacry", ".petya",
            ".cryptolocker", ".paradise",
        ],
        "event_type": "file",
        "false_positives": "Rare. Some backup tools may use similar extension patterns.",
    },
    {
        "id": "ransom-002",
        "name": "Shadow Copy Deletion",
        "description": "Deletion of Windows Volume Shadow Copy service is a common pre-encryption step used by ransomware to prevent recovery.",
        "severity": "critical",
        "mitre_techniques": ["T1490"],
        "patterns": [
            "vssadmin delete shadows", "vssadmin delete shadow",
            "wmic shadowcopy delete", "cmd /c vssadmin",
            "vssadmin resize shadowstorage",
        ],
        "event_type": "process",
        "false_positives": "Legitimate administrative backup cleanup.",
    },
    {
        "id": "ransom-003",
        "name": "Ransomware Readme / Note Creation",
        "description": "Creation of ransomware ransom-note files (README.txt, HOW_TO_DECRYPT.txt, DECRYPT_INSTRUCTION) in many directories.",
        "severity": "high",
        "mitre_techniques": ["T1486"],
        "patterns": [
            "readme.txt", "how_to_decrypt", "decrypt_instruction",
            "restore_files", "ransom", "recover.txt",
        ],
        "event_type": "file",
        "false_positives": "Some phishing lures use similar filenames.",
    },
    {
        "id": "ransom-004",
        "name": "Suspicious PowerShell Encrypted Payload",
        "description": "PowerShell executing base64 encoded or IEX download-and-execute patterns often used in ransomware / C2 delivery.",
        "severity": "high",
        "mitre_techniques": ["T1059.001", "T1218"],
        "patterns": [
            "powershell -enc", "powershell -e", "iex(", "invoke-expression",
            "downloadstring", "frombase64string",
        ],
        "event_type": "powershell",
        "false_positives": "Some automation scripts use encoded commands.",
    },
    {
        "id": "ransom-005",
        "name": "SMB / SMBv1 Mass Write Suspicion",
        "description": "Rapid SMB writes across many shares consistent with lateral ransomware propagation.",
        "severity": "high",
        "mitre_techniques": ["T1021.002", "T1486"],
        "patterns": ["smb write", "admin$", "c$", "\\\\", "smb", "net use"],
        "event_type": "network",
        "false_positives": "Legitimate large file transfers.",
    },
    {
        "id": "ransom-006",
        "name": "Cryptography / Cipher Usage Spike",
        "description": "Heavy use of file encryption crypto APIs or tools like certutil, gpg, 7z in a short window.",
        "severity": "medium",
        "mitre_techniques": ["T1486"],
        "patterns": ["certutil", "gpg", "7z a -p", "aes-256", "cryptencryptfile"],
        "event_type": "process",
        "false_positives": "Backup and CI/CD encryption workflows.",
    },
    {
        "id": "ransom-007",
        "name": "Registry Run Key Persistence for Ransomware",
        "description": "Writing to HKCU/HKLM Run keys frequently used for ransomware persistence after encryption.",
        "severity": "medium",
        "mitre_techniques": ["T1547.001"],
        "patterns": ["currentversion\\run", "hkcu\\...\\run", "hkcr", "runonce"],
        "event_type": "registry",
        "false_positives": "Legitimate software installation.",
    },
    {
        "id": "ransom-008",
        "name": "Beacon / C2 Callback Detection",
        "description": "Suspicious periodic outbound connections consistent with ransomware C2 beacons prior to encryption.",
        "severity": "high",
        "mitre_techniques": ["T1071.001"],
        "patterns": ["beacon", "c2", "http beacon", "dns tunnel", "domain generation"],
        "event_type": "network",
        "false_positives": "Legitimate monitoring agents.",
    },
]

RECOMMENDED_ACTIONS = [
    "Immediately isolate affected host(s) from the network (EDR isolate).",
    "Disable SMBv1 and block SMB at the firewall if lateral movement is suspected.",
    "Preserve evidence: snapshot memory and disk, capture EDR telemetry.",
    "Search for and revoke compromised credentials used by affected accounts.",
    "Check backups for integrity; ensure immutable/offline backups exist.",
    "Open a high-severity incident and attach all associated events as evidence.",
]


def match_ransomware_rule(rule: dict, event: object) -> bool:
    """Check whether a SIEM event matches a ransomware rule pattern."""
    haystack_parts: list[str] = []
    for attr in ("message", "raw_data", "event_type", "source", "tags", "mitre_techniques"):
        val = getattr(event, attr, None)
        if val:
            haystack_parts.append(str(val))
    haystack = " ".join(haystack_parts).lower()

    event_type = getattr(event, "event_type", "") or ""
    if rule.get("event_type") and rule["event_type"] not in event_type.lower():
        return False

    return any(p.lower() in haystack for p in rule.get("patterns", []))


async def enrich_indicator(
    indicator: str,
    indicator_type: str = "ip",
    providers: list[str] | None = None,
) -> dict:
    """Enrich an IOC against configured external threat-intel providers."""
    providers = providers or ["virustotal", "abuseipdb", "greynoise", "shodan"]
    results = []
    max_score = 0

    for provider in providers:
        try:
            if provider == "virustotal":
                result = await _virustotal(indicator, indicator_type)
            elif provider == "abuseipdb":
                result = await _abuseipdb(indicator)
            elif provider == "greynoise":
                result = await _greynoise(indicator)
            elif provider == "shodan":
                result = await _shodan(indicator)
            else:
                continue
            results.append(result)
            max_score = max(max_score, result.get("data", {}).get("score", 0))
        except Exception as e:
            logger.warning("enrichment_failed", provider=provider, error=str(e))
            results.append({
                "provider": provider,
                "success": False,
                "error": str(e),
                "data": None,
            })

    if not results:
        return {
            "indicator": indicator,
            "indicator_type": indicator_type,
            "results": [],
            "overall_score": None,
            "verdict": "no_providers",
            "enriched_at": None,
        }

    if max_score >= 75:
        verdict = "malicious"
    elif max_score >= 40:
        verdict = "suspicious"
    else:
        verdict = "benign"

    from datetime import datetime, timezone
    return {
        "indicator": indicator,
        "indicator_type": indicator_type,
        "results": results,
        "overall_score": max_score,
        "verdict": verdict,
        "enriched_at": datetime.now(timezone.utc),
    }


async def _virustotal(indicator: str, indicator_type: str) -> dict:
    if not settings.VIRUSTOTAL_API_KEY:
        raise RuntimeError("VIRUSTOTAL_API_KEY not configured")
    endpoint = {"ip": "ip_addresses", "domain": "domains", "url": "urls", "hash": "files"}.get(indicator_type)
    if not endpoint:
        raise RuntimeError(f"VirusTotal does not support indicator type {indicator_type}")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"https://www.virustotal.com/api/v3/{endpoint}/{indicator}",
            headers={"x-apikey": settings.VIRUSTOTAL_API_KEY},
        )
        if resp.status_code == 404:
            return {"provider": "virustotal", "success": True, "data": {"found": False, "score": 0}}
        resp.raise_for_status()
        data = resp.json().get("data", {})
        attrs = data.get("attributes", {})
        stats = attrs.get("last_analysis_stats", {})
        malicious = stats.get("malicious", 0)
        total = sum(stats.values()) or 1
        score = int((malicious / total) * 100)
        return {
            "provider": "virustotal",
            "success": True,
            "data": {
                "found": True,
                "score": score,
                "malicious": malicious,
                "suspicious": stats.get("suspicious", 0),
                "total": total,
                "reputation": attrs.get("reputation", 0),
                "last_analysis": attrs.get("last_analysis_results", {}),
            },
        }


async def _abuseipdb(indicator: str) -> dict:
    if not settings.ABUSEIPDB_API_KEY:
        raise RuntimeError("ABUSEIPDB_API_KEY not configured")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            "https://api.abuseipdb.com/api/v2/check",
            params={"ipAddress": indicator, "maxAgeInDays": 90},
            headers={"Key": settings.ABUSEIPDB_API_KEY, "Accept": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json().get("data", {})
        score = int(data.get("abuseConfidenceScore", 0))
        return {
            "provider": "abuseipdb",
            "success": True,
            "data": {
                "score": score,
                "isWhitelisted": data.get("isWhitelisted"),
                "countryCode": data.get("countryCode"),
                "usageType": data.get("usageType"),
                "totalReports": data.get("totalReports"),
                "lastReportedAt": data.get("lastReportedAt"),
            },
        }


async def _greynoise(indicator: str) -> dict:
    if not settings.GREYNOISE_API_KEY:
        raise RuntimeError("GREYNOISE_API_KEY not configured")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"https://api.greynoise.io/v3/community/{indicator}",
            headers={"key": settings.GREYNOISE_API_KEY},
        )
        if resp.status_code == 404:
            return {"provider": "greynoise", "success": True, "data": {"noise": False, "score": 0}}
        resp.raise_for_status()
        data = resp.json()
        score = 75 if data.get("classification") == "malicious" else 25 if data.get("noise") else 0
        return {
            "provider": "greynoise",
            "success": True,
            "data": {
                "noise": data.get("noise", False),
                "riot": data.get("riot", False),
                "classification": data.get("classification"),
                "name": data.get("name"),
                "score": score,
            },
        }


async def _shodan(indicator: str) -> dict:
    if not settings.SHODAN_API_KEY:
        raise RuntimeError("SHODAN_API_KEY not configured")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"https://api.shodan.io/shodan/host/{indicator}",
            params={"key": settings.SHODAN_API_KEY},
        )
        if resp.status_code == 404:
            return {"provider": "shodan", "success": True, "data": {"found": False, "score": 0}}
        resp.raise_for_status()
        data = resp.json()
        ports = data.get("ports", [])
        vulns = data.get("vulns", [])
        score = 60 if vulns else 20 if ports else 0
        return {
            "provider": "shodan",
            "success": True,
            "data": {
                "found": True,
                "score": score,
                "ports": ports,
                "vulns": list(vulns) if isinstance(vulns, dict) else vulns,
                "os": data.get("os"),
                "country": data.get("country_code"),
                "org": data.get("org"),
            },
        }
