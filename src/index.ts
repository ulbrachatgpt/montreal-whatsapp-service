import express,{type Request,type Response,type NextFunction} from "express";
import {config} from "./config.js"; import {getUserFromBearer,assertOrgMembership,supabase,type AppUser} from "./supabase.js"; import {SessionManager} from "./session-manager.js";
declare global{namespace Express{interface Request{appUser?:AppUser}}}
const app=express(), sessions=new SessionManager(); app.disable("x-powered-by"); app.use(express.json({limit:"55mb"}));
const routeId=(req:Request)=>{const v=req.params.id; return Array.isArray(v)?String(v[0]||""):String(v||"");};
async function auth(req:Request,res:Response,next:NextFunction){try{const u=await getUserFromBearer(req.headers.authorization);if(!u){res.status(401).json({error:"Não autenticado."});return;}req.appUser=u;next();}catch(e){next(e)}}
async function conn(id:string,user:string,roles?:string[]){const {data,error}=await supabase.from("whatsapp_connections").select("id,organization_id").eq("id",id).single();if(error)throw error;await assertOrgMembership(user,data.organization_id,roles);return data;}
app.get("/health",(_q,r)=>r.json({ok:true,service:"montreal-whatsapp-service",transport:"WhatsApp Web / Multi-Device"}));
app.post("/connections",auth,async(q,r,n)=>{try{const org=String(q.body?.organization_id||"");await assertOrgMembership(q.appUser!.id,org,["owner","admin"]);const row=await sessions.createConnection(org);r.status(201).json({connection_id:row.id,status:row.status});}catch(e){n(e)}});
app.get("/connections/:id/qr",auth,async(q,r,n)=>{try{const id=routeId(q);await conn(id,q.appUser!.id);r.json(await sessions.getQr(id));}catch(e){n(e)}});
app.post("/connections/:id/reconnect",auth,async(q,r,n)=>{try{const id=routeId(q);await conn(id,q.appUser!.id,["owner","admin"]);await sessions.restart(id);r.json({ok:true,status:"RECONNECTING"});}catch(e){n(e)}});
app.post("/connections/:id/logout",auth,async(q,r,n)=>{try{const id=routeId(q);await conn(id,q.appUser!.id,["owner","admin"]);await sessions.logout(id);r.json({ok:true,status:"LOGGED_OUT"});}catch(e){n(e)}});
app.post("/connections/:id/messages",auth,async(q,r,n)=>{try{const id=routeId(q);await conn(id,q.appUser!.id);r.json(await sessions.send(id,q.body));}catch(e){n(e)}});
app.use((e:unknown,_q:Request,r:Response,_n:NextFunction)=>{const m=e instanceof Error?e.message:"Erro interno.";r.status(m.includes("permissão")||m.includes("pertence")?403:500).json({error:m});});
const server=app.listen(config.port,"0.0.0.0",()=>sessions.bootExistingSessions().catch(console.error)); for(const s of ["SIGTERM","SIGINT"])process.on(s,()=>server.close(()=>process.exit(0)));
