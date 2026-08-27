// External timing-device support (Draggy, RaceBox). Not implemented yet — each device has its
// own Bluetooth (BLE) packet format, and getting that wrong wouldn't fail loudly, it would just
// silently report the wrong speed, which is the one thing this app can't get wrong for roll-race
// timing. Real driver code goes here once we have the official protocol spec for each device.
//
// Once a driver exists, LocationContext should prefer its samples over phone GPS (dedicated GPS
// pucks like these sample faster and more accurately than a phone), feeding the same
// {lat, lng, heading, speedMps} shape it already publishes — no changes needed downstream in
// MapPage, RollRaceWatcher, or the server, since they only ever see that shape.

export function isBluetoothSupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export const DEVICES = [
  { id: 'draggy', label: 'Draggy' },
  { id: 'racebox', label: 'RaceBox' },
];
