import 'dotenv/config';
import {pool} from '../src/db.js';
import {initSchema} from '../src/schema.js';
try {await initSchema();console.log('Base de datos inicializada');}finally{await pool.end();}
