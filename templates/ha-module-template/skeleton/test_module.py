"""Unit test suite for the Thassi Home Assistant Python Module Skeleton."""

from __future__ import annotations

import unittest
import urllib.error
from .sensor import ModuleConfig, ThassiModuleSensor, create_module_instance


class TestThassiModuleSensor(unittest.TestCase):
    """Verifies initialization, state calculation, HA payload schema, and API error resilience."""

    def test_module_initialization(self) -> None:
        sensor = create_module_instance({"slug": "test_energy", "name": "Test Energy"})
        self.assertEqual(sensor.entity_id, "sensor.thassi_test_energy")
        self.assertEqual(sensor.state, 0.0)
        self.assertEqual(sensor.status_flag, "IDLE")

        with self.assertRaises(ValueError):
            ThassiModuleSensor(ModuleConfig(slug="", name="Invalid"))

        with self.assertRaises(ValueError):
            ThassiModuleSensor(ModuleConfig(slug="fast_poll", name="Fast", polling_interval_seconds=1))

    def test_sensor_state_calculation(self) -> None:
        sensor = create_module_instance({"slug": "shelly_guard", "anomaly_threshold": 200.0})
        payload = sensor.evaluate_readings(
            {
                "sensor.shellyplugsg3_e4b063e4bfd8_power": "85.5",
                "sensor.links_power": 44.5,
                "sensor.offline_device": "unavailable",
            }
        )
        self.assertEqual(payload["state"], 130.0)
        self.assertEqual(payload["attributes"]["status_flag"], "OK")
        self.assertEqual(payload["attributes"]["average"], 65.0)
        self.assertEqual(payload["attributes"]["peak"], 85.5)
        self.assertIn("sensor.offline_device", payload["attributes"]["skipped_entities"])

        # Trigger high load anomaly threshold
        high_payload = sensor.evaluate_readings(
            {
                "sensor.shellyplugsg3_e4b063e4bfd8_power": 180.0,
                "sensor.links_power": 95.0,
            }
        )
        self.assertEqual(high_payload["state"], 275.0)
        self.assertEqual(high_payload["attributes"]["status_flag"], "ALERT_HIGH_LOAD")

    def test_api_error_and_timeout_handling(self) -> None:
        sensor = create_module_instance()

        # 1. Missing credentials
        missing_res = sensor.fetch_ha_states("", "")
        self.assertFalse(missing_res["ok"])
        self.assertEqual(missing_res["status_flag"], "ERROR_AUTH_CONFIG")

        # 2. Simulated TimeoutError
        def timeout_fetcher(_url: str, _headers: dict, _timeout: float) -> dict:
            raise TimeoutError("Home Assistant REST API timed out after 5.0s")

        timeout_res = sensor.fetch_ha_states("http://192.168.188.92:8123", "token", http_fetcher=timeout_fetcher)
        self.assertFalse(timeout_res["ok"])
        self.assertEqual(timeout_res["status_flag"], "ERROR_NETWORK_OR_TIMEOUT")
        self.assertIn("timed out", timeout_res["error"])

        # 3. Simulated HTTP 401 Unauthorized
        def http_401_fetcher(url: str, _headers: dict, _timeout: float) -> dict:
            raise urllib.error.HTTPError(url, 401, "Unauthorized", hdrs=None, fp=None)  # type: ignore[arg-type]

        auth_err = sensor.fetch_ha_states("http://192.168.188.92:8123", "bad_token", http_fetcher=http_401_fetcher)
        self.assertFalse(auth_err["ok"])
        self.assertEqual(auth_err["status_flag"], "ERROR_HTTP_401")

    def test_ha_entity_payload_contract(self) -> None:
        sensor = create_module_instance({"slug": "contract_check", "unit_of_measurement": "kWh"})
        payload = sensor.evaluate_readings({"sensor.a": 12.34})
        self.assertIn("entity_id", payload)
        self.assertIn("state", payload)
        self.assertIn("attributes", payload)
        attrs = payload["attributes"]
        self.assertEqual(attrs["unit_of_measurement"], "kWh")
        self.assertEqual(attrs["friendly_name"], "Shelly Energy & Anomaly Guard")
        self.assertEqual(attrs["sample_count"], 1)


if __name__ == "__main__":
    unittest.main()
