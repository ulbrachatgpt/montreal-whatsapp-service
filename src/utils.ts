import fs from "node:fs/promises";
import path from "node:path";
import type { proto } from "@whiskeysockets/baileys";
import { getContentType } from "@whiskeysockets/baileys";
export async function ensureDir(dir:string){ await fs.mkdir(dir,{recursive:true,mode:0o700}); }
export async function removeDir(dir:string){ await fs.rm(dir,{recursive:true,force:true}); }
export function safeFileName(input?:string|null){ return (input||"arquivo").replace(/[^\w.\-]+/g,"_").slice(0,120)||"arquivo"; }
export function jidToPhone(jid?:string|null){ if(!jid)return ""; if(jid.endsWith("@g.us"))return jid; return jid.split("@")[0].split(":")[0].replace(/\D/g,""); }
export function normalizeTarget(target:string){ if(target.includes("@"))return target.trim(); const d=target.replace(/\D/g,""); if(!d)throw new Error("Destino inválido."); return `${d}@s.whatsapp.net`; }
export function getMessageType(m?:proto.IMessage|null){ const t=m?getContentType(m):undefined; if(t==="conversation"||t==="extendedTextMessage")return"text"; if(t==="imageMessage")return"image"; if(t==="videoMessage")return"video"; if(t==="audioMessage")return"audio"; if(t==="documentMessage")return"document"; if(t==="stickerMessage")return"sticker"; return"other"; }
export function getMessageBody(m?:proto.IMessage|null){ if(!m)return null; return m.conversation||m.extendedTextMessage?.text||m.imageMessage?.caption||m.videoMessage?.caption||m.documentMessage?.caption||null; }
export function sessionPath(root:string,id:string){ return path.join(root,id); }