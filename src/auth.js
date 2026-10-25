import {Router} from 'express';
import {randomBytes,createHash,scrypt as _scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {pool} from './db.js';
const scrypt=promisify(_scrypt);
export const authRouter=Router();
const secure=process.env.NODE_ENV==='production';
const TTL=8*60*60*1000;
const bad=new Map();
const hash=t=>createHash('sha256').update(t).digest('hex');
const userPattern=/^[a-z0-9._-]{3,40}$/;
const cookieName='manicura_session';
function cookies(req){const raw=req.headers.cookie||'';return Object.fromEntries(raw.split(';').map(p=>{const i=p.indexOf('=');return i<0?['','']:[p.slice(0,i).trim(),p.slice(i+1).trim()]}));}
function setCookie(res,value,maxAge){res.cookie(cookieName,value,{httpOnly:true,secure,sameSite:'strict',path:'/',maxAge});}
async function passwordHash(password){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64);return salt+':'+key.toString('hex');}
async function verify(password,stored){try{const [salt,hex]=stored.split(':');const actual=await scrypt(password,salt,64);const expected=Buffer.from(hex,'hex');return actual.length===expected.length && timingSafeEqual(actual,expected);}catch{return false;}}
function fail(res,status,message){return res.status(status).json({error:message});}
function rateKey(req,username){return (req.ip||'ip')+':'+username;}
function locked(k){const rec=bad.get(k);return rec && rec.until>Date.now();}
function failed(k){const now=Date.now(),rec=bad.get(k)||{count:0,until:0};rec.count++;if(rec.count>=5){rec.until=now+15*60*1000;rec.count=0;}bad.set(k,rec);if(bad.size>2000)bad.clear();}
async function currentUser(req){const token=cookies(req)[cookieName];if(!token||!/^([a-f0-9]{64})$/.test(token))return null;const {rows}=await pool.query(`SELECT u.id,u.username,u.role FROM staff_sessions s JOIN staff_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE`,[hash(token)]);return rows[0]||null;}
export async function requireAuth(req,res,next){
 try{
  const user=await currentUser(req);
  if(!user)return fail(res,401,'Inicia sesión');
  req.staffUser=user;
  next();
 }catch(err){next(err);}
}
function admin(req,res,next){if(req.staffUser?.role!=='admin')return fail(res,403,'Requiere administrador');next();}
// El alta inicial se cerró tras crear la cuenta administradora.
// Nuevas cuentas: POST /api/auth/users con sesión de administrador.
authRouter.post('/login',async(req,res,next)=>{try{
const username=String(req.body?.username||'').trim().toLowerCase(),password=req.body?.password;
if(!userPattern.test(username)||typeof password!=='string')return fail(res,401,'Credenciales inválidas');
const k=rateKey(req,username);if(locked(k))return fail(res,429,'Demasiados intentos; intenta más tarde');
const {rows}=await pool.query('SELECT id,username,role,password_hash FROM staff_users WHERE username=$1 AND active=TRUE',[username]);
if(!rows.length||!await verify(password,rows[0].password_hash)){failed(k);return fail(res,401,'Credenciales inválidas');}
bad.delete(k);
const token=randomBytes(32).toString('hex');await pool.query('DELETE FROM staff_sessions WHERE expires_at<NOW()');
await pool.query('INSERT INTO staff_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[hash(token),rows[0].id,new Date(Date.now()+TTL)]);
setCookie(res,token,TTL);return res.json({user:{id:rows[0].id,username:rows[0].username,role:rows[0].role}});
}catch(e){next(e);}});
authRouter.get('/me',async(req,res,next)=>{try{const user=await currentUser(req);if(!user)return fail(res,401,'Sin sesión');return res.json({user});}catch(e){next(e);}});
authRouter.post('/logout',async(req,res,next)=>{try{const token=cookies(req)[cookieName];if(token)await pool.query('DELETE FROM staff_sessions WHERE token_hash=$1',[hash(token)]);res.clearCookie(cookieName,{httpOnly:true,secure,sameSite:'strict',path:'/'});return res.json({ok:true});}catch(e){next(e);}});
authRouter.get('/users',requireAuth,admin,async(req,res,next)=>{try{const {rows}=await pool.query('SELECT id,username,role,active,created_at FROM staff_users ORDER BY id');res.json(rows);}catch(e){next(e);}});
authRouter.post('/users',requireAuth,admin,async(req,res,next)=>{try{const username=String(req.body?.username||'').trim().toLowerCase(),password=req.body?.password,role=req.body?.role;
if(!userPattern.test(username)||typeof password!=='string'||password.length<12||password.length>128||!['staff','admin'].includes(role))return fail(res,400,'Datos de usuario inválidos');
const {rows}=await pool.query('INSERT INTO staff_users(username,password_hash,role) VALUES($1,$2,$3) RETURNING id,username,role,active',[username,await passwordHash(password),role]);res.status(201).json(rows[0]);
}catch(e){if(e.code==='23505')return fail(res,409,'Usuario existente');next(e);}});

// Administración de cuentas, restringida al rol administrador.
authRouter.patch('/users/:id',requireAuth,admin,async(req,res,next)=>{try{
 const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return fail(res,400,'Usuario inválido');
 const target=await pool.query('SELECT id,username,role,active FROM staff_users WHERE id=$1',[id]);
 if(!target.rowCount)return fail(res,404,'Usuario no encontrado');
 const keys=Object.keys(req.body||{});if(!keys.length||keys.some(k=>!['active','role','password'].includes(k)))return fail(res,400,'Campos inválidos');
 let {active,role,password}=req.body;
 if(active!==undefined && typeof active!=='boolean')return fail(res,400,'Estado inválido');
 if(role!==undefined&&!['admin','staff'].includes(role))return fail(res,400,'Rol inválido');
 if(password!==undefined&&(typeof password!=='string'||password.length<12||password.length>128))return fail(res,400,'Contraseña inválida');
 if(id===Number(req.staffUser.id)&&(active===false||role==='staff'))return fail(res,400,'No puedes desactivar ni degradar tu propia cuenta');
 // Evita eliminar o degradar al último administrador activo.
 if(target.rows[0].role==='admin'&&target.rows[0].active&&(active===false||role==='staff')){
   const count=await pool.query("SELECT COUNT(*)::int AS n FROM staff_users WHERE role='admin' AND active=TRUE");
   if(count.rows[0].n<=1)return fail(res,409,'Debe existir al menos un administrador activo');
 }
 const patch=[],vals=[];
 if(active!==undefined){vals.push(active);patch.push(`active=$${vals.length}`);}
 if(role!==undefined){vals.push(role);patch.push(`role=$${vals.length}`);}
 if(password!==undefined){vals.push(await passwordHash(password));patch.push(`password_hash=$${vals.length}`);}
 vals.push(id);
 const {rows}=await pool.query(`UPDATE staff_users SET ${patch.join(',')} WHERE id=$${vals.length} RETURNING id,username,role,active`,vals);
 if(active===false||password!==undefined||role!==undefined)await pool.query('DELETE FROM staff_sessions WHERE user_id=$1',[id]);
 return res.json(rows[0]);
}catch(e){next(e);}});
