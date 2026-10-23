import 'dotenv/config';
import {pool} from '../src/db.js';

async function send(phone,service,when){
 const {WA_ACCESS_TOKEN,WA_PHONE_NUMBER_ID,WA_TEMPLATE_NAME='recordatorio_cita',WA_TEMPLATE_LANG='es',WA_API_VERSION='v23.0'}=process.env;
 if(!WA_ACCESS_TOKEN||!WA_PHONE_NUMBER_ID)throw new Error('WhatsApp no configurado');
 const date=new Intl.DateTimeFormat('es-CR',{timeZone:'America/Costa_Rica',dateStyle:'full',timeStyle:'short'}).format(new Date(when));
 // La plantilla aprobada debe incluir exactamente 2 variables en el cuerpo: servicio y fecha/hora.
 const body={messaging_product:'whatsapp',to:phone.replace(/\D/g,''),type:'template',template:{name:WA_TEMPLATE_NAME,language:{code:WA_TEMPLATE_LANG},components:[{type:'body',parameters:[{type:'text',text:service},{type:'text',text:date}]}]}};
 const res=await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${WA_PHONE_NUMBER_ID}/messages`,{method:'POST',headers:{Authorization:`Bearer ${WA_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!res.ok)throw new Error(`WhatsApp HTTP ${res.status}: ${(await res.text()).slice(0,300)}`);
}
try{
 if(!process.env.WA_ACCESS_TOKEN||!process.env.WA_PHONE_NUMBER_ID){console.log('WhatsApp no configurado: se omite el envío');process.exitCode=0;}
 else {
  // Solo citas dentro de las próximas 24 h; el cron se ejecuta cada 15 minutos.
  const {rows}=await pool.query(`UPDATE appointments a SET reminder_status='processing' FROM clients c WHERE a.client_id=c.id AND a.status='confirmed' AND a.reminder_status IN ('pending','failed') AND a.starts_at BETWEEN NOW()+INTERVAL '23 hours 45 minutes' AND NOW()+INTERVAL '24 hours' AND c.whatsapp_opt_in=TRUE RETURNING a.id,a.service,a.starts_at,c.phone`);
  for(const row of rows){try{await send(row.phone,row.service,row.starts_at);await pool.query(`UPDATE appointments SET reminder_status='sent',reminder_sent_at=NOW(),reminder_error=NULL WHERE id=$1`,[row.id]);console.log('Enviado',row.id);}catch(e){await pool.query(`UPDATE appointments SET reminder_status='failed',reminder_error=$2 WHERE id=$1`,[row.id,String(e.message).slice(0,300)]);console.error(row.id,e.message);}}
 }
}finally{await pool.end();}
