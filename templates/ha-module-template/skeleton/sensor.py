"""Generic Thassi Home Assistant Sensor & Automation Module."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional
import urllib.error
import urllib.request
import json


@dataclass
class ModuleConfig:
    """Configuration derived from the Thassi Home Assistant Module Template."""

    slug: str
    name: str
    domain: str = "sensor"
    unit_of_measurement: str = "W"
    icon: str = "mdi:lightning-bolt-circle"
    target_entities: List[str] = field(default_factory=list)
    polling_interval_seconds: int = 60
    anomaly_threshold: float = 250.0


class ThassiModuleSensor:
    """Home Assistant compatible Python sensor & evaluator with resilient API error handling."""

    def __init__(self, config: ModuleConfig) -> None:
        if not config.slug or not config.slug.strip():
            raise ValueError("Module slug must not be empty")
        if config.polling_interval_seconds < 5:
            raise ValueError("polling_interval_seconds must be at least 5 seconds")
        self.config = config
        self._state: float = 0.0
        self._status_flag: str = "IDLE"
        self._last_error: Optional[str] = None
        self._samples: List[float] = []
        self._updated_at: str = datetime.now(timezone.utc).isoformat()

    @property
    def entity_id(self) -> str:
        return f"{self.config.domain}.thassi_{self.config.slug}"

    @property
    def state(self) -> float:
        return self._state

    @property
    def status_flag(self) -> str:
        return self._status_flag

    def evaluate_readings(self, entity_values: Dict[str, Any]) -> Dict[str, Any]:
        """Compute aggregated sensor state and anomaly flags from Home Assistant entity readings."""
        numeric_values: List[float] = []
        skipped_entities: List[str] = []

        for entity_id, raw_val in (entity_values or {}).items():
            if raw_val in (None, "unavailable", "unknown", ""):
                skipped_entities.append(entity_id)
                continue
            try:
                val = float(raw_val)
                if val >= 0:
                    numeric_values.append(val)
                else:
                    skipped_entities.append(entity_id)
            except (TypeError, ValueError):
                skipped_entities.append(entity_id)

        if not numeric_values:
            self._status_flag = "WARNING_NO_VALID_DATA"
            self._updated_at = datetime.now(timezone.utc).isoformat()
            return self.to_ha_payload(skipped_entities=skipped_entities)

        total_val = round(sum(numeric_values), 2)
        avg_val = round(total_val / len(numeric_values), 2)
        peak_val = round(max(numeric_values), 2)

        self._state = total_val
        self._samples.append(total_val)
        if len(self._samples) > 50:
            self._samples = self._samples[-50:]

        if total_val >= self.config.anomaly_threshold:
            self._status_flag = "ALERT_HIGH_LOAD"
        else:
            self._status_flag = "OK"

        self._last_error = None
        self._updated_at = datetime.now(timezone.utc).isoformat()
        return self.to_ha_payload(
            average=avg_val,
            peak=peak_val,
            active_sources=len(numeric_values),
            skipped_entities=skipped_entities,
        )

    def fetch_ha_states(
        self,
        ha_url: str,
        ha_token: str,
        http_fetcher: Optional[Callable[[str, Dict[str, str], float], Any]] = None,
        timeout: float = 5.0,
    ) -> Dict[str, Any]:
        """Fetch target entity states from Home Assistant REST API with full error handling."""
        if not ha_url or not ha_token:
            self._status_flag = "ERROR_AUTH_CONFIG"
            self._last_error = "Missing HA_URL or HA_TOKEN"
            return {"ok": False, "error": self._last_error, "status_flag": self._status_flag}

        clean_url = ha_url.rstrip("/")
        headers = {
            "Authorization": f"Bearer {ha_token}",
            "Content-Type": "application/json",
        }

        readings: Dict[str, Any] = {}
        try:
            for entity_id in self.config.target_entities:
                url = f"{clean_url}/api/states/{entity_id}"
                if http_fetcher is not None:
                    payload = http_fetcher(url, headers, timeout)
                else:
                    req = urllib.request.Request(url, headers=headers, method="GET")
                    with urllib.request.urlopen(req, timeout=timeout) as resp:
                        payload = json.loads(resp.read().decode("utf-8"))
                if isinstance(payload, dict):
                    readings[entity_id] = payload.get("state")
            evaluated = self.evaluate_readings(readings)
            return {"ok": True, "readings": readings, "payload": evaluated}
        except urllib.error.HTTPError as exc:
            self._status_flag = f"ERROR_HTTP_{exc.code}"
            self._last_error = f"HTTP {exc.code}: {exc.reason}"
            try:
                exc.close()
            except Exception:
                pass
            return {"ok": False, "error": self._last_error, "status_flag": self._status_flag}
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            self._status_flag = "ERROR_NETWORK_OR_TIMEOUT"
            self._last_error = str(exc)
            return {"ok": False, "error": self._last_error, "status_flag": self._status_flag}

    def to_ha_payload(self, **extra_attributes: Any) -> Dict[str, Any]:
        """Format state and attributes for Home Assistant /api/states/<entity_id>."""
        attrs: Dict[str, Any] = {
            "friendly_name": self.config.name,
            "unit_of_measurement": self.config.unit_of_measurement,
            "icon": self.config.icon,
            "status_flag": self._status_flag,
            "target_entities": self.config.target_entities,
            "polling_interval_seconds": self.config.polling_interval_seconds,
            "sample_count": len(self._samples),
            "last_error": self._last_error,
            "updated_at": self._updated_at,
        }
        attrs.update(extra_attributes)
        return {
            "entity_id": self.entity_id,
            "state": self._state,
            "attributes": attrs,
        }


def create_module_instance(raw_config: Optional[Dict[str, Any]] = None) -> ThassiModuleSensor:
    """Factory helper used by the n8n workflow and unit tests."""
    data = raw_config or {}
    cfg = ModuleConfig(
        slug=str(data.get("slug", "shelly_energy_guard")),
        name=str(data.get("name", "Shelly Energy & Anomaly Guard")),
        domain=str(data.get("domain", "sensor")),
        unit_of_measurement=str(data.get("unit_of_measurement", "W")),
        icon=str(data.get("icon", "mdi:lightning-bolt-circle")),
        target_entities=list(
            data.get(
                "target_entities",
                [
                    "sensor.shellyplugsg3_e4b063e4bfd8_power",
                    "sensor.links_power",
                ],
            )
        ),
        polling_interval_seconds=int(data.get("polling_interval_seconds", 60)),
        anomaly_threshold=float(data.get("anomaly_threshold", 250.0)),
    )
    return ThassiModuleSensor(cfg)
