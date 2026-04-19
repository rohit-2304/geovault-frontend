/**
 * Retrieves the current GPS coordinates of the user.
 * We use 'enableHighAccuracy' to ensure we satisfy the 50m PostGIS check.
 */
export const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation){
            reject(new Error("Geolocation is not supported by your browser."));
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                });
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy:true,
                timeout : 10000,
                maximumAge : 0,
            }
        );
    });
};