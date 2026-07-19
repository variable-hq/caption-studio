interface AudioInputDevice {
  deviceId: string;
}

export function chooseAudioInputDevice(
  devices: readonly AudioInputDevice[],
  currentDeviceId: string,
  activeDeviceId?: string,
) {
  const availableIds = new Set(devices.map(({ deviceId }) => deviceId));

  if (currentDeviceId && availableIds.has(currentDeviceId)) return currentDeviceId;
  if (activeDeviceId && availableIds.has(activeDeviceId)) return activeDeviceId;

  return (
    devices.find(({ deviceId }) => deviceId === "default")?.deviceId ??
    devices[0]?.deviceId ??
    ""
  );
}
