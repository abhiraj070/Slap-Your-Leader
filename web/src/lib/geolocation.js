export class GeolocationError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "GeolocationError";
    this.reason = reason;
  }
}

/** Keyed by `GeolocationError.reason`. */
export const GEOLOCATION_COPY = {
  unsupported: {
    overline: "Unsupported browser",
    title: "This browser can't report location",
    body: "Geolocation isn't available here. Try Chrome, Safari, or Firefox.",
  },
  denied: {
    overline: "Location blocked",
    title: "We can't see where you are",
    body: "Enable location for this site in your browser settings, then try again.",
  },
  unavailable: {
    overline: "No fix",
    title: "Your device couldn't place itself",
    body: "Moving somewhere with a clearer signal usually helps.",
  },
  timeout: {
    overline: "Timed out",
    title: "That took too long",
    body: "Finding your location timed out. Give it another go.",
  },
};

/**
 * Promise wrapper over the callback-style Geolocation API.
 *
 * Note: the browser only shows its permission prompt in response to this call,
 * which is why it must run from a user gesture rather than on page load.
 */
export function requestPosition() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new GeolocationError("unsupported"));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            return reject(new GeolocationError("denied"));
          case error.TIMEOUT:
            return reject(new GeolocationError("timeout"));
          default:
            return reject(new GeolocationError("unavailable"));
        }
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  });
}
