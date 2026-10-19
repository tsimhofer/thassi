"""Generated Home Assistant Python Module: Vorzimmer & Stiegenhaus Motion Optimizer (vorzimmer_lighting_optimizer)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional
import urllib.error
import urllib.request
import json


@dataclass
class ModuleConfig:
    """Configuration for Vorzimmer & Stiegenhaus Motion Optimizer."""

    slug: str = "vorzimmer_lighting_optimizer"
    name: str = "Vorzimmer & Stiegenhaus Motion Optimizer"
    domain: str = "sensor"
    unit_of_measurement: str = "lx"
    icon: str = "mdi:motion-sensor"
    target_entities: List[str] = field(
        default_factory=lambda: [
          "sensor.shelly2pmg3_8cbfea9ac754_output_0_leistung",
          "sensor.shelly2pmg3_8cbfea9ac754_output_1_leistung",
          "sensor.shelly_blu_motion_19ca_beleuchtungsstarke"
]
    )
    polling_interval_seconds: int = 45
    anomaly_threshold: float = 180.0


class ThassiModuleSensor:
    """Evaluates Home Assistant sensors, calculates efficiency scores, and handles REST API errors."""

    def __init__(self, config: Optional[ModuleConfig] = None) -> None:
        self.config = config or ModuleConfig()
        if not self.config.slug or not self.config.slug.strip():
            raise ValueError("Module slug must not be empty")
        if self.config.polling_interval_seconds < 5:
            raise ValueError("polling_interval_seconds must be >= 5")
        self._state: float = 0.0
        self._status_flag: str = "IDLE"
        self._efficiency_score: int = 100
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
        """Aggregate numeric readings and compute efficiency + anomaly status."""
        power_readings: List[float] = []
        temperature_c: Optional[float] = None
        skipped_entities: List[str] = []

        for entity_id, raw_val in (entity_values or {}).items():
            if raw_val in (None, "unavailable", "unknown", ""):
                skipped_entities.append(entity_id)
                continue
            try:
                val = float(raw_val)
                if "temperatur" in entity_id.lower() or "temp" in entity_id.lower():
                    temperature_c = round(val, 1)
                elif val >= 0:
                    power_readings.append(val)
                else:
                    skipped_entities.append(entity_id)
            except (TypeError, ValueError):
                skipped_entities.append(entity_id)

        if not power_readings:
            self._status_flag = "WARNING_NO_VALID_DATA"
            self._updated_at = datetime.now(timezone.utc).isoformat()
            return self.to_ha_payload(skipped_entities=skipped_entities, temperature_c=temperature_c)

        total_power = round(sum(power_readings), 2)
        avg_power = round(total_power / len(power_readings), 2)
        peak_power = round(max(power_readings), 2)

        self._state = total_power
        self._samples.append(total_power)
        if len(self._samples) > 50:
            self._samples = self._samples[-50:]

        ratio = min(1.0, total_power / max(1.0, self.config.anomaly_threshold))
        self._efficiency_score = max(0, int(round((1.0 - ratio * 0.65) * 100)))

        if total_power >= self.config.anomaly_threshold:
            self._status_flag = "ALERT_HIGH_LOAD"
        elif total_power <= 5.0:
            self._status_flag = "STANDBY_OPTIMAL"
        else:
            self._status_flag = "OK"

        self._last_error = None
        self._updated_at = datetime.now(timezone.utc).isoformat()
        return self.to_ha_payload(
            average_w=avg_power,
            peak_w=peak_power,
            efficiency_score=self._efficiency_score,
            temperature_c=temperature_c,
            active_sources=len(power_readings),
            skipped_entities=skipped_entities,
        )

    def fetch_ha_states(
        self,
        ha_url: str,
        ha_token: str,
        http_fetcher: Optional[Callable[[str, Dict[str, str], float], Any]] = None,
        timeout: float = 5.0,
    ) -> Dict[str, Any]:
        """Fetch live entity states from Home Assistant with structured exception handling."""
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
        """Build Home Assistant REST state payload."""
        attrs: Dict[str, Any] = {
            "friendly_name": self.config.name,
            "unit_of_measurement": self.config.unit_of_measurement,
            "icon": self.config.icon,
            "status_flag": self._status_flag,
            "efficiency_score": self._efficiency_score,
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
    """Create a configured Vorzimmer & Stiegenhaus Motion Optimizer sensor instance."""
    data = raw_config or {}
    cfg = ModuleConfig(
        slug=str(data.get("slug", "vorzimmer_lighting_optimizer")),
        name=str(data.get("name", "Vorzimmer & Stiegenhaus Motion Optimizer")),
        domain=str(data.get("domain", "sensor")),
        unit_of_measurement=str(data.get("unit_of_measurement", "lx")),
        icon=str(data.get("icon", "mdi:motion-sensor")),
        target_entities=list(
            data.get(
                "target_entities",
                [
          "sensor.shelly2pmg3_8cbfea9ac754_output_0_leistung",
          "sensor.shelly2pmg3_8cbfea9ac754_output_1_leistung",
          "sensor.shelly_blu_motion_19ca_beleuchtungsstarke"
],
            )
        ),
        polling_interval_seconds=int(data.get("polling_interval_seconds", 45)),
        anomaly_threshold=float(data.get("anomaly_threshold", 180.0)),
    )
    return ThassiModuleSensor(cfg)
