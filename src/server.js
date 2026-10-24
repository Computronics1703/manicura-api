import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import {timingSafeEqual} from 'node:crypto';
import {authRouter, requireAuth} from './auth.js';
import {pool} from './db.js';
import {initSchema} from './schema.js';

if (!process.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY.length < 24) throw new Error('Configura ADMIN_API_KEY con al menos 24 caracteres');
const app=express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({limit:'30kb'}));
app.use(express.static('public'));
app.use('/api/auth',authRouter);
const origin=process.env.CORS_ORIGIN;
app.use((req,res,next)=>{
 if(origin && origin !== '*' && req.headers.origin===origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-API-Key');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');}
 if(req.method==='OPTIONS') return res.sendStatus(origin && req.headers.origin!==origin ? 403 : 204);
 next();
});
const text = (v,max=180)=>typeof v==='string' && v.trim().length>0 && v.trim().length<=max ? v.trim():null;
const integer = v => /^\d+$/.test(String(v)) && Number.isSafeInteger(Number(v)) && Number(v)>0 ? Number(v):null;
const isoDate = v => typeof v==='string' && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && !Number.isNaN(Date.parse(v)) ? new Date(v):null;
const error=(res,code,message)=>res.status(code).json({error:message});
app.get('/health',async(req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true,service:'manicura-api'});}catch{error(res,503,'Base de datos no disponible');}});
app.use('/api',requireAuth);
app.get('/api/clients',async(req,res,next)=>{try{const {rows}=await pool.query('SELECT * FROM clients ORDER BY id DESC LIMIT 500');res.json(rows);}catch(e){next(e);}});
app.post('/api/clients',async(req,res,next)=>{try{
 const name=text(req.body?.name,120),phone=text(req.body?.phone,30);
 if(!name||!phone||!/^\+?[0-9]{8,15}$/.test(phone))return error(res,400,'Nombre y teléfono internacional válidos son obligatorios');
 const notes=typeof req.body.notes==='string'?req.body.notes.slice(0,1000):'';
 const opt=req.body.whatsapp_opt_in===true;
 const {rows}=await pool.query('INSERT INTO clients(name,phone,notes,whatsapp_opt_in) VALUES($1,$2,$3,$4) RETURNING *',[name,phone,notes,opt]);res.status(201).json(rows[0]);
 }catch(e){next(e);}});
app.patch('/api/clients/:id',async(req,res,next)=>{try{
 const id=integer(req.params.id);if(!id)return error(res,400,'ID inválido');
 const allowed=['name','phone','notes','whatsapp_opt_in'];const update=Object.entries(req.body||{}).filter(([k])=>allowed.includes(k));
 if(!update.length)return error(res,400,'Sin campos válidos');
 for(const [k,v] of update){if((k==='name'&&!text(v,120))||(k==='phone'&&(!text(v,30)||!/^\+?[0-9]{8,15}$/.test(v)))||(k==='notes'&&(typeof v!=='string'||v.length>1000))||(k==='whatsapp_opt_in'&&typeof v!=='boolean'))return error(res,400,'Campo inválido: '+k);}
 const values=update.map(([,v])=>v);const sql=`UPDATE clients SET ${update.map(([k],i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${values.length+1} RETURNING *`;
 const {rows}=await pool.query(sql,[...values,id]);if(!rows.length)return error(res,404,'Cliente no encontrado');res.json(rows[0]);
 }catch(e){next(e);}});
app.get('/api/appointments',async(req,res,next)=>{try{
 const from=isoDate(req.query.from),to=isoDate(req.query.to);if(!from||!to||from>=to)return error(res,400,'Indica from y to en ISO 8601 con zona horaria');
 const {rows}=await pool.query(`SELECT a.*, c.name AS client_name, c.phone AS client_phone FROM appointments a JOIN clients c ON c.id=a.client_id WHERE a.starts_at < $2 AND a.ends_at > $1 ORDER BY a.starts_at LIMIT 1000`,[from,to]);res.json(rows);
 }catch(e){next(e);}});
app.post('/api/appointments',async(req,res,next)=>{let client;try{
 const clientId=integer(req.body?.client_id),service=text(req.body?.service,120),start=isoDate(req.body?.starts_at),end=isoDate(req.body?.ends_at);
 if(!clientId||!service||!start||!end||start>=end||end-start>8*3600000)return error(res,400,'Cliente, servicio y horas válidas son obligatorios (máximo 8 horas)');
 client=await pool.connect();await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(784122)');
 const exists=await client.query('SELECT id FROM clients WHERE id=$1',[clientId]);if(!exists.rowCount){await client.query('ROLLBACK');return error(res,404,'Cliente no encontrado');}
 const conflicts=await client.query(`SELECT id FROM appointments WHERE status='confirmed' AND starts_at < $2 AND ends_at > $1 LIMIT 1`,[start,end]);
 if(conflicts.rowCount){await client.query('ROLLBACK');return error(res,409,'Horario ocupado');}
 const {rows}=await client.query(`INSERT INTO appointments(client_id,service,starts_at,ends_at,notes) VALUES($1,$2,$3,$4,$5) RETURNING *`,[clientId,service,start,end,typeof req.body.notes==='string'?req.body.notes.slice(0,1000):'']);
 await client.query('COMMIT');res.status(201).json(rows[0]);
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});next(e);}finally{client?.release();}});
app.patch('/api/appointments/:id/status',async(req,res,next)=>{try{
 const id=integer(req.params.id),status=req.body?.status;
 if(!id||!['confirmed','cancelled','completed'].includes(status))return error(res,400,'Estado inválido');
 const {rows}=await pool.query(`UPDATE appointments SET status=$1,reminder_status=CASE WHEN $1='confirmed' AND status!='confirmed' THEN 'pending' ELSE reminder_status END WHERE id=$2 RETURNING *`,[status,id]);
 if(!rows.length)return error(res,404,'Cita no encontrada');res.json(rows[0]);
 }catch(e){next(e);}});
app.use((err,req,res,next)=>{console.error(err);error(res,500,'Error interno del servidor');});
const port=Number(process.env.PORT||3000);
await initSchema();
app.listen(port,'0.0.0.0',()=>console.log(`manicura-api listening on ${port}`));
