import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function read(collection) {
  const file = path.join(DATA_DIR, `${collection}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function write(collection, data) {
  fs.writeFileSync(path.join(DATA_DIR, `${collection}.json`), JSON.stringify(data, null, 2));
}

export function findAll(collection, filter = {}) {
  return read(collection).filter(item =>
    Object.entries(filter).every(([k, v]) => item[k] === v)
  );
}

export function findOne(collection, filter) {
  return findAll(collection, filter)[0] || null;
}

export function findById(collection, id) {
  return read(collection).find(item => item.id === id) || null;
}

export function insertOne(collection, doc) {
  const data = read(collection);
  data.push(doc);
  write(collection, data);
  return doc;
}

export function updateOne(collection, id, update) {
  const data = read(collection);
  const idx = data.findIndex(item => item.id === id);
  if (idx === -1) return null;
  data[idx] = { ...data[idx], ...update };
  write(collection, data);
  return data[idx];
}

export function deleteOne(collection, id) {
  const data = read(collection);
  const idx = data.findIndex(item => item.id === id);
  if (idx === -1) return false;
  data.splice(idx, 1);
  write(collection, data);
  return true;
}

export function pushToArray(collection, id, field, value) {
  const data = read(collection);
  const idx = data.findIndex(item => item.id === id);
  if (idx === -1) return null;
  if (!data[idx][field]) data[idx][field] = [];
  data[idx][field].push(value);
  write(collection, data);
  return data[idx];
}
