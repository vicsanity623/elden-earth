// ============================================================
// Elden Earth — geometry & spherical math
// ============================================================
const Geo = (() => {
  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;
  const EARTH_RADIUS_METERS = 6378137;
  const ORIGIN_SHIFT = 2 * Math.PI * 6378137 / 2.0;

  // Lat/Lon -> Spherical Mercator meters
  function toMercator(lat, lon) {
    const x = lon * ORIGIN_SHIFT / 180.0;
    let y = Math.log(Math.tan((90 + lat) * Math.PI / 360.0)) / (Math.PI / 180.0);
    y = y * ORIGIN_SHIFT / 180.0;
    return { x, y };
  }

  // Spherical Mercator meters -> Lat/Lon
  function fromMercator(x, y) {
    const lon = (x / ORIGIN_SHIFT) * 180.0;
    let lat = (y / ORIGIN_SHIFT) * 180.0;
    lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180.0)) - Math.PI / 2.0);
    return { lat, lon };
  }

  // Given (lat, lon) and a tile size in meters, return tile coordinates (tx, ty)
  function tileForLatLon(lat, lon, tileSizeMeters) {
    const m = toMercator(lat, lon);
    return {
      tx: Math.floor(m.x / tileSizeMeters),
      ty: Math.floor(m.y / tileSizeMeters),
    };
  }

  // Return the four lat/lon corners of a given tile [SW, NW, NE, SE]
  function tileBounds(tx, ty, tileSizeMeters) {
    const minX = tx * tileSizeMeters;
    const minY = ty * tileSizeMeters;
    const maxX = (tx + 1) * tileSizeMeters;
    const maxY = (ty + 1) * tileSizeMeters;

    const sw = fromMercator(minX, minY);
    const nw = fromMercator(minX, maxY);
    const ne = fromMercator(maxX, maxY);
    const se = fromMercator(maxX, minY);

    return [
      [sw.lat, sw.lon],
      [nw.lat, nw.lon],
      [ne.lat, ne.lon],
      [se.lat, se.lon],
    ];
  }

  // Haversine distance between two lat/lon pairs in meters
  function haversine(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * DEG2RAD;
    const dLon = (lon2 - lon1) * DEG2RAD;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_METERS * c;
  }

  // Balanced random point (ensures healthy mix of close and far spawns)
  function randomPointInRadius(lat, lon, radiusM) {
    const isClose = Math.random() < 0.50;
    const maxR = isClose ? radiusM * 0.45 : radiusM;
    const r = maxR * Math.random();

    const theta = Math.random() * 2 * Math.PI;
    const dLat = (r * Math.sin(theta)) / 111320;
    const dLon = (r * Math.cos(theta)) / (111320 * Math.cos(lat * Math.PI / 180));
    return { lat: lat + dLat, lon: lon + dLon };
  }

  // Creates GeoJSON polygon ring for circles
  function createCirclePolygon(centerLat, centerLon, radiusMeters, points = 48) {
    const coords = [];
    const km = radiusMeters / 1000;
    const distanceLat = (km / 111.32);
    const distanceLon = (km / (111.32 * Math.cos(centerLat * Math.PI / 180)));

    for (let i = 0; i < points; i++) {
      const theta = (i / points) * (2 * Math.PI);
      const x = distanceLon * Math.cos(theta);
      const y = distanceLat * Math.sin(theta);
      coords.push([centerLon + x, centerLat + y]);
    }
    coords.push(coords[0]); // Close loop
    return coords;
  }

  // Fast reverse-geocoding cache for City, State & Country
  const territoryCache = {};
  async function getTerritoryInfo(lat, lon) {
    const key = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
    if (territoryCache[key]) return territoryCache[key];

    const US_STATES = {
      "Alabama":"AZ","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO",
      "Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID",
      "Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA",
      "Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN",
      "Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV",
      "New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC",
      "North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA",
      "Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX",
      "Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV",
      "Wisconsin":"WI","Wyoming":"WY","District of Columbia":"DC"
    };

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`);
      const data = await res.json();
      const addr = data.address || {};

      const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || "Phoenix";
      const rawState = addr.state || "Arizona";
      const stateCode = US_STATES[rawState] || (rawState.length === 2 ? rawState.toUpperCase() : rawState);
      const country = addr.country || "United States";
      const cc = addr.country_code ? addr.country_code.toUpperCase() : "US";
      const flag = cc.replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));

      const info = {
        city: `${city}, ${stateCode} ${flag}`,
        state: `${rawState} ${flag}`,
        country: `${country} ${flag}`
      };

      territoryCache[key] = info;
      return info;
    } catch (e) {
      return {
        city: "Phoenix, AZ 🇺🇸",
        state: "Arizona 🇺🇸",
        country: "United States 🇺🇸"
      };
    }
  }

  return {
    tileForLatLon,
    tileBounds,
    fromMercator,
    toMercator,
    haversine,
    randomPointInRadius,
    createCirclePolygon,
    getTerritoryInfo
  };
})();
