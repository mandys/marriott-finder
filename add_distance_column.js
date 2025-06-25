#!/usr/bin/env node
/**
 * add_distance_column.js
 * ----------------------
 * Adds two columns to data/hotels.csv:
 *   • DistanceKmFromAirport
 *   • DriveMinutesFromAirport
 *
 * The script geocodes each hotel and its nearest city airport using Mapbox
 * Geocoding + Directions APIs, then writes the updated CSV.
 *
 * Usage:
 *   MAPBOX_TOKEN=pk.xxx npm run add-distance
 *
 * Notes & quotas:
 *   • Mapbox free tier allows 100k requests/month – enough for 150 hotels.
 *   • Results are cached in .cache/geocode.json & .cache/route.json to avoid
 *     hitting the API repeatedly while developing.
 */
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import pLimit from 'p-limit';

const token = process.env.MAPBOX_TOKEN;
if (!token) {
  console.error('MAPBOX_TOKEN env var required (get one at account.mapbox.com)');
  process.exit(1);
}

const csvPath = path.join('data', 'hotels.csv');
if (!fs.existsSync(csvPath)) {
  console.error('data/hotels.csv not found');
  process.exit(1);
}

const cacheDir = path.join('.cache');
fs.mkdirSync(cacheDir, { recursive: true });
const geocodeCachePath = path.join(cacheDir, 'geocode.json');
const routeCachePath = path.join(cacheDir, 'route.json');
const geocodeCache = fs.existsSync(geocodeCachePath) ? JSON.parse(fs.readFileSync(geocodeCachePath)) : {};
const routeCache = fs.existsSync(routeCachePath) ? JSON.parse(fs.readFileSync(routeCachePath)) : {};

function saveCaches() {
  fs.writeFileSync(geocodeCachePath, JSON.stringify(geocodeCache, null, 2));
  fs.writeFileSync(routeCachePath, JSON.stringify(routeCache, null, 2));
}

async function geocode(place) {
  if (geocodeCache[place]) return geocodeCache[place];
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(place)}.json?limit=1&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocode failed for ${place}: ${res.status}`);
  const json = await res.json();
  const feature = json.features[0];
  if (!feature) throw new Error(`No geocode result for ${place}`);
  const [lon, lat] = feature.center;
  geocodeCache[place] = { lat, lon };
  return geocodeCache[place];
}

async function route(from, to) {
  const key = `${from.lat},${from.lon}-${to.lat},${to.lon}`;
  if (routeCache[key]) return routeCache[key];
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Route failed: ${res.status}`);
  const json = await res.json();
  let routeData = json.routes && json.routes[0];
  if (!routeData) {
    // Fallback to straight-line distance using haversine formula
    const toRad = d => (d * Math.PI) / 180;
    const R = 6371; // Earth radius km
    const dLat = toRad(to.lat - from.lat);
    const dLon = toRad(to.lon - from.lon);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightKm = R * c;
    routeData = { distance: straightKm * 1000, duration: straightKm / 50 * 3600 }; // assume 50 km/h average
  }
  routeCache[key] = {
    distanceKm: routeData.distance / 1000,
    durationMin: routeData.duration / 60
  };
  return routeCache[key];
}

// Static coordinates (lat, lon) for main Indian airports to avoid geocoding ambiguities
const airportCoords = {
  'bengaluru': { lat: 13.1986, lon: 77.7066 },   // BLR
  'bangalore': { lat: 13.1986, lon: 77.7066 },
  'hyderabad': { lat: 17.2403, lon: 78.4298 },   // HYD
  'chennai':   { lat: 12.9890, lon: 80.1690 },   // MAA
  'mumbai':    { lat: 19.0896, lon: 72.8656 },   // BOM
  'navi mumbai': { lat: 19.0896, lon: 72.8656 },
  'pune':      { lat: 18.5829, lon: 73.9191 },   // PNQ
  'new delhi': { lat: 28.5562, lon: 77.1000 },   // DEL
  'delhi':     { lat: 28.5562, lon: 77.1000 },
  'gurgaon':   { lat: 28.5562, lon: 77.1000 },   // treat Gurgaon as DEL
  'gurugram':  { lat: 28.5562, lon: 77.1000 },
  'jaipur':    { lat: 26.8242, lon: 75.8122 },   // JAI
  'goa':       { lat: 15.3800, lon: 73.8310 },   // GOI (Dabolim)
  'kochi':     { lat: 10.1510, lon: 76.4019 },   // COK
  'ahmedabad': { lat: 23.0734, lon: 72.6266 },   // AMD
  'kolkata':   { lat: 22.6549, lon: 88.4467 },   // CCU
  'lucknow':   { lat: 26.7606, lon: 80.8893 },   // LKO
  'visakhapatnam': { lat: 17.7228, lon: 83.2244 }, // VTZ
  'indore':    { lat: 22.7218, lon: 75.8010 },
  'nagpur':    { lat: 21.0922, lon: 79.0472 },
  'coimbatore': { lat: 11.0300, lon: 77.0430 },
  'vadodara':  { lat: 22.3270, lon: 73.2193 },
  'srinagar':  { lat: 33.9871, lon: 74.7743 },
  'dehradun':  { lat: 30.1897, lon: 78.1803 },
  'jodhpur':   { lat: 26.2511, lon: 73.0489 },
  'agra':      { lat: 27.1558, lon: 77.9609 },
  'siliguri':  { lat: 26.6812, lon: 88.3286 },   // IXB Bagdogra
  'pushkar':   { lat: 26.6015, lon: 74.8122 },   // KQH Kishangarh
  'ramnagar':  { lat: 29.0225, lon: 79.4745 },   // PGH Pantnagar
  'tehri':     { lat: 30.1897, lon: 78.1803 },   // DED Jolly Grant
  'tehri garhwal': { lat: 30.1897, lon: 78.1803 },
  'madikeri':  { lat: 11.9186, lon: 75.5481 },   // CNN Kannur
  'jaisalmer': { lat: 26.8714, lon: 70.8643 },   // JSA
  'raipur':    { lat: 21.1806, lon: 81.7395 },   // RPR
  'nashik':    { lat: 19.9637, lon: 73.8076 },    // ISK
  'faridabad':  { lat: 28.5562, lon: 77.1000 },   // use Delhi (DEL)
  'ganderbal':  { lat: 33.9871, lon: 74.7743 },   // Srinagar (SXR)
  'madurai':    { lat: 9.8345,  lon: 78.0934 },   // IXM
  'visakhapatnam': { lat: 17.7219, lon: 83.2242 },
  'bhopal':    { lat: 23.2878, lon: 77.3370 },
  'chandigarh': { lat: 30.6720, lon: 76.7885 },
  'mahabaleshwar': { lat: 18.5829, lon: 73.9191 }, // use Pune PNQ
  'shillong':  { lat: 25.7036, lon: 91.9787 },
  'neelambur': { lat: 11.0300, lon: 77.0430 },
  'amritsar':  { lat: 31.7085, lon: 74.7993 },
  'calangute': { lat: 15.3800, lon: 73.8310 },
  'katra':     { lat: 32.6891, lon: 74.8374 }, // Jammu airport
  'tiruchirappalli': { lat: 10.7654, lon: 78.7097 },
  'sriperumbudur': { lat: 12.9890, lon: 80.1690 }, // Chennai
  'belgaum': { lat: 15.8593, lon: 74.6183 },
  'belagavi': { lat: 15.8593, lon: 74.6183 },
  'mussoorie': { lat: 30.1897, lon: 78.1803 }, // Dehradun
  'bilaspur': { lat: 21.9884, lon: 82.1106 }
};

function airportForCity(cityRaw) {
  const key = cityRaw.toLowerCase();
  // direct
  if (airportCoords[key]) return airportCoords[key];
  // partial match
  for (const name in airportCoords) {
    if (key.includes(name)) return airportCoords[name];
  }
  return null;
}

// ------------------------------
// Main
// ------------------------------
const records = parse(fs.readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true });

const limit = pLimit(5); // 5 concurrent requests

(async () => {
  try {
    for (const row of records) {
      const dist = parseFloat(row.DistanceKmFromAirport);
      if (!isNaN(dist) && dist > 0 && dist < 200) {
        continue; // looks sane, skip recalculation
      }

      const hotelPlace = `${row.Hotel}, ${row.City}, India`;
      const staticAirport = airportForCity(row.City);
      let airportCoord;
      if (staticAirport) {
        airportCoord = staticAirport;
      } else {
        const airportPlace = `${row.City} International Airport, India`;
        airportCoord = await limit(() => geocode(airportPlace));
      }

      try {
        const hotelCoord = await limit(() => geocode(hotelPlace));
        const { distanceKm, durationMin } = await limit(() => route(hotelCoord, airportCoord));
        row.DistanceKmFromAirport = distanceKm.toFixed(1);
        row.DriveMinutesFromAirport = Math.round(durationMin);
        console.log(`✔ ${row.Hotel}: ${row.DistanceKmFromAirport} km / ${row.DriveMinutesFromAirport} min`);
      } catch (err) {
        console.warn(`⚠ ${row.Hotel}: ${err.message}`);
        row.DistanceKmFromAirport = '';
        row.DriveMinutesFromAirport = '';
      }
    }

    saveCaches();

    const header = [...Object.keys(records[0])];
    const csvOut = stringify(records, { header: true, columns: header });
    fs.writeFileSync(csvPath, csvOut, 'utf8');
    console.log('CSV updated with distance columns.');
  } catch (err) {
    console.error(err);
  }
})(); 