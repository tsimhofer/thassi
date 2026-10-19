"""Unit tests for the generated thassi_projects_monitor Home Assistant Python module."""

from __future__ import annotations

import unittest
import urllib.error
from python_modules.thassi_projects_monitor.sensor import (
    ModuleConfig,
    ThassiModuleSensor,
    create_module_instance,
)


class TestGeneratedModule(unittest.TestCase):
    """Phase 5 Unit Tests: Initialization, State Calculation, API Error Handling & HA Payload."""

    def test_module_initialization(self) -> None:
        sensor = create_module_instance()
        self.assertEqual(sensor.entity_id, "sensor.thassi_thassi_projects_monitor")
        self.assertEqual(sensor.state, 0.0)
        self.assertEqual(sensor.status_flag, "IDLE")

        with self.assertRaises(ValueError):
            ThassiModuleSensor(ModuleConfig(slug="", name="Invalid"))

        with self.assertRaises(ValueError):
            ThassiModuleSensor(ModuleConfig(slug="bad_interval", polling_interval_seconds=2))

    def test_sensor_state_calculation(self) -> None:
        sensor = create_module_instance({"anomaly_threshold": 200.0})
        res = sensor.evaluate_readings(
            {
                "sensor.thassi_project_workflow_shelly_energy_guard": "62.4",
                "sensor.secondary_power": 37.6,
                "sensor.shellyhtg3_e4b32331dde0_temperatur": "22.5",
                "sensor.offline": "unavailable",
            }
        )
        self.assertEqual(res["state"], 100.0)
        self.assertEqual(res["attributes"]["status_flag"], "OK")
        self.assertEqual(res["attributes"]["average_w"], 50.0)
        self.assertEqual(res["attributes"]["peak_w"], 62.4)
        self.assertEqual(res["attributes"]["temperature_c"], 22.5)
        self.assertIn("sensor.offline", res["attributes"]["skipped_entities"])

        high_res = sensor.evaluate_readings(
            {
                "sensor.thassi_project_workflow_shelly_energy_guard": 180.0,
                "sensor.secondary_power": 90.0,
            }
        )
        self.assertEqual(high_res["state"], 270.0)
        self.assertEqual(high_res["attributes"]["status_flag"], "ALERT_HIGH_LOAD")

    def test_api_error_and_timeout_handling(self) -> None:
        sensor = create_module_instance()

        no_auth = sensor.fetch_ha_states("", "")
        self.assertFalse(no_auth["ok"])
        self.assertEqual(no_auth["status_flag"], "ERROR_AUTH_CONFIG")

        def raise_timeout(_u: str, _h: dict, _t: float) -> dict:
            raise TimeoutError("Connection to 192.168.188.92:8123 timed out")

        timeout_res = sensor.fetch_ha_states(
            "http://192.168.188.92:8123", "valid_token", http_fetcher=raise_timeout
        )
        self.assertFalse(timeout_res["ok"])
        self.assertEqual(timeout_res["status_flag"], "ERROR_NETWORK_OR_TIMEOUT")

        def raise_http_502(url: str, _h: dict, _t: float) -> dict:
            raise urllib.error.HTTPError(url, 502, "Bad Gateway", hdrs=None, fp=None)  # type: ignore[arg-type]

        http_res = sensor.fetch_ha_states(
            "http://192.168.188.92:8123", "valid_token", http_fetcher=raise_http_502
        )
        self.assertFalse(http_res["ok"])
        self.assertEqual(http_res["status_flag"], "ERROR_HTTP_502")

    def test_ha_entity_payload_contract(self) -> None:
        sensor = create_module_instance()
        payload = sensor.evaluate_readings({"sensor.thassi_project_workflow_shelly_energy_guard": 3.2})
        self.assertEqual(payload["entity_id"], "sensor.thassi_thassi_projects_monitor")
        self.assertEqual(payload["state"], 3.2)
        self.assertEqual(payload["attributes"]["status_flag"], "STANDBY_OPTIMAL")
        self.assertEqual(payload["attributes"]["unit_of_measurement"], "%")
        self.assertGreaterEqual(payload["attributes"]["efficiency_score"], 90)


if __name__ == "__main__":
    unittest.main()
