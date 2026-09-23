import QRCode from "qrcode";
import pino from "pino";
import { Boom } from "@hapi/boom";
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser, useMultiFileAuthState, type WASocket } from "@whiskeysockets/baileys";
import { config } from "./config.js";
import { supabase } from "./supabase.js";
import { ensureDir, normalizeTarget, removeDir, sessionPath } from "./utils.js";

const logger=pino({level:config.logLevel});
type Status="CONNECTING"|"QR_REQUIRED"|"CONNECTED"|"DISCONNECTED"|"RECONNECTING"|"LOGGED_OUT"|"ERROR";
type Row={id:string;organization_id:string;session_id:string;phone_number:string|null;status:Status};
type Runtime={row:Row;socket:WASocket;status:Status;qr:string|null;expires:string|null};

export class SessionManager {
 private runtimes=new Map<string,Runtime>();
 async bootExistingSessions(){
  await ensureDir(config.sessionRoot);
  const {data,error}=await supabase.from("whatsapp_connections").select("id,organization_id,session_id,phone_number,status").neq("status","LOGGED_OUT");
  if(error) throw error;
  for(const row of (data||[]) as Row[]) this.start(row).catch(e=>logger.error({e},"restore"));
 }
 async createConnection(org:string){
  const {data,error}=await supabase.from("whatsapp_connections").insert({organization_id:org,session_id:crypto.randomUUID(),status:"CONNECTING"}).select("id,organization_id,session_id,phone_number,status").single();
  if(error) throw error; await this.start(data as Row); return data as Row;
 }
 async getQr(id:string){const r=this.runtimes.get(id); const row=await this.getRow(id); return {qr:r?.qr||null,status:r?.status||row.status,expires_at:r?.expires||null};}
 async restart(id:string){const row=await this.getRow(id); const r=this.runtimes.get(id); try{r?.socket.end(undefined)}catch{} this.runtimes.delete(id); await this.update(id,"RECONNECTING"); await this.start(row);}
 async logout(id:string){const row=await this.getRow(id); const r=this.runtimes.get(id); try{await r?.socket.logout()}catch{} this.runtimes.delete(id); await removeDir(sessionPath(config.sessionRoot,row.session_id)); await this.update(id,"LOGGED_OUT");}
 async send(id:string,p:any){const r=this.runtimes.get(id); if(!r||r.status!=="CONNECTED")throw new Error("WhatsApp não está conectado."); const jid=normalizeTarget(String(p.to||"")); let content:any;
  if((p.type||"text")==="text"){if(!p.text)throw new Error("Mensagem vazia."); content={text:p.text};}
  else {if(!p.media_base64)throw new Error("media_base64 obrigatório."); const b=Buffer.from(p.media_base64,"base64"); if(p.type==="image")content={image:b,caption:p.caption||""}; else if(p.type==="video")content={video:b,caption:p.caption||"",mimetype:p.mime_type||"video/mp4"}; else if(p.type==="audio")content={audio:b,mimetype:p.mime_type||"audio/ogg; codecs=opus",ptt:Boolean(p.ptt)}; else content={document:b,mimetype:p.mime_type||"application/octet-stream",fileName:p.file_name||"documento"};}
  const sent=await r.socket.sendMessage(jid,content); return {message_id:sent?.key?.id||null,to:jid};
 }
 private async getRow(id:string){const {data,error}=await supabase.from("whatsapp_connections").select("id,organization_id,session_id,phone_number,status").eq("id",id).single(); if(error)throw error; return data as Row;}
 private async update(id:string,status:Status,extra:any={}){await supabase.from("whatsapp_connections").update({status,updated_at:new Date().toISOString(),...extra}).eq("id",id);}
 private async start(row:Row){
  if(this.runtimes.has(row.id))return; const dir=sessionPath(config.sessionRoot,row.session_id); await ensureDir(dir); await this.update(row.id,"CONNECTING");
  const {state,saveCreds}=await useMultiFileAuthState(dir); const {version}=await fetchLatestBaileysVersion();
  const socket=makeWASocket({version,auth:state,printQRInTerminal:false,browser:Browsers.ubuntu("Montreal WhatsApp"),logger:logger.child({connectionId:row.id}),markOnlineOnConnect:false});
  const runtime:Runtime={row,socket,status:"CONNECTING",qr:null,expires:null}; this.runtimes.set(row.id,runtime); socket.ev.on("creds.update",saveCreds);
  socket.ev.on("connection.update",async u=>{
   if(u.qr){runtime.status="QR_REQUIRED";runtime.qr=await QRCode.toDataURL(u.qr,{margin:1,width:320});runtime.expires=new Date(Date.now()+60000).toISOString();await this.update(row.id,"QR_REQUIRED");}
   if(u.connection==="open"){runtime.status="CONNECTED";runtime.qr=null;runtime.expires=null;const phone=socket.user?.id?jidNormalizedUser(socket.user.id).split("@")[0]:null;await this.update(row.id,"CONNECTED",{phone_number:phone,display_name:socket.user?.name||null,last_connected_at:new Date().toISOString(),last_error:null});}
   if(u.connection==="close"){const boom=u.lastDisconnect?.error as Boom|undefined; if(boom?.output?.statusCode===DisconnectReason.loggedOut){this.runtimes.delete(row.id);await removeDir(dir);await this.update(row.id,"LOGGED_OUT");return;} runtime.status="RECONNECTING";this.runtimes.delete(row.id);await this.update(row.id,"RECONNECTING",{last_error:boom?.message||"Conexão interrompida"});setTimeout(()=>this.start(row).catch(()=>{}),3000);}
  });
 }
}