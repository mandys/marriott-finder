#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const csvPath = path.join('data', 'hotels.csv');
if (!fs.existsSync(csvPath)) {
  console.error('Cannot find data/hotels.csv');
  process.exit(1);
}

const records = parse(fs.readFileSync(csvPath, 'utf8'), {
  columns: true,
  skip_empty_lines: true
});

// Mapping city -> state
const cityState = {
  'Tehri Garhwal': 'Uttarakhand',
  'Navi Mumbai': 'Maharashtra',
  'Hyderabad': 'Telangana',
  'Faridabad': 'Haryana',
  'Chennai': 'Tamil Nadu',
  'Bengaluru': 'Karnataka',
  'Siliguri': 'West Bengal',
  'Pushkar': 'Rajasthan',
  'Mumbai': 'Maharashtra',
  'Kochi': 'Kerala',
  'Ramnagar': 'Uttarakhand',
  'Visakhapatnam': 'Andhra Pradesh',
  'Pune': 'Maharashtra',
  'Gurugram Haryana': 'Haryana',
  'Gurgaon': 'Haryana',
  'New Delhi': 'Delhi',
  'Delhi': 'Delhi',
  'Delhi NCR': 'Delhi',
  'Sohna-Gurgaon': 'Haryana',
  'Raipur': 'Chhattisgarh',
  'Madurai': 'Tamil Nadu',
  'Lucknow': 'Uttar Pradesh',
  'Kolkata': 'West Bengal',
  'Vishakhapatnam': 'Andhra Pradesh',
  'Vadodara': 'Gujarat',
  'Sohna': 'Haryana',
  'Surat': 'Gujarat',
  'Mahabaleshwar': 'Maharashtra',
  'Ganderbal': 'Jammu and Kashmir',
  'Indore': 'Madhya Pradesh',
  'Jaipur': 'Rajasthan',
  'Agra': 'Uttar Pradesh',
  'Dehradun': 'Uttarakhand',
  'Coimbatore': 'Tamil Nadu',
  'Amritsar': 'Punjab',
  'Ahmedabad': 'Gujarat',
  'Belgaum': 'Karnataka',
  'Belagavi': 'Karnataka',
  'Calangute': 'Goa',
  'Colva': 'Goa',
  'Goa': 'Goa',
  'Anjuna': 'Goa',
  'Mussoorie': 'Uttarakhand',
  'Bhopal': 'Madhya Pradesh',
  'Tiruchirappalli': 'Tamil Nadu',
  'Sriperumbudur': 'Tamil Nadu',
  'Srinagar': 'Jammu and Kashmir',
  'Katra': 'Jammu and Kashmir',
  'Bilaspur Chhattisgarh': 'Chhattisgarh',
  'Shillong': 'Meghalaya',
  'Mahabalipuram': 'Tamil Nadu',
  'Mahabalipuram Resort': 'Tamil Nadu',
  'Madikeri': 'Karnataka',
  'Jaisalmer': 'Rajasthan',
  'Vadodara': 'Gujarat',
  'Nashik': 'Maharashtra',
  'Nagpur': 'Maharashtra',
  'Jhansi': 'Uttar Pradesh'
};

let missing = new Set();
const updated = records.map(r => {
  const state = cityState[r.City] || '';
  if (!state) missing.add(r.City);
  return { ...r, State: state };
});

if (missing.size) {
  console.warn('Missing city-to-state mapping for:', Array.from(missing).join(', '));
}

// Write CSV with State as last col
const header = [...Object.keys(records[0]), 'State'];
const csvOut = stringify(updated, { header: true, columns: header });
fs.writeFileSync(csvPath, csvOut, 'utf8');
console.log('Updated hotels.csv with State column.'); 