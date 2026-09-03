export interface Coordinates {
  lat: number;
  lon: number;
}

export function requestCurrentLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('该浏览器不支持定位'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      (error) => reject(new Error(error.message)),
      { timeout: 8000 },
    );
  });
}
