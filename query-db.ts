import { db } from './server/db.js';

console.log('--- Families Table ---');
const families = db.prepare('SELECT * FROM families').all();
console.log(JSON.stringify(families, null, 2));
