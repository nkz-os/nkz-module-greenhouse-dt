"""A Device linked to several zones is returned once."""

from app.api.state import _get_sensors_for_zones


class FakeClient:
    def __init__(self, by_zone):
        self.by_zone = by_zone

    def query_entities(self, type, q):
        for zone, items in self.by_zone.items():
            if zone in q:
                return list(items)
        return []


def test_device_in_two_zones_returned_once():
    shared = {"id": "urn:ngsi-ld:Device:d1"}
    client = FakeClient({
        "zoneA": [shared, {"id": "urn:ngsi-ld:Device:d2"}],
        "zoneB": [shared, {"id": "urn:ngsi-ld:Device:d3"}],
    })
    result = _get_sensors_for_zones(client, ["zoneA", "zoneB"])
    assert [s["id"] for s in result] == [
        "urn:ngsi-ld:Device:d1", "urn:ngsi-ld:Device:d2", "urn:ngsi-ld:Device:d3",
    ]
