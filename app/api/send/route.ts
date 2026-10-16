import {checkOrigin,json,token} from "@/lib/server";
import {payload,type SourceRow} from "@/lib/receipts";
import {apiResponseMessage} from "@/lib/api-response";

export async function POST(req:Request){
  if(!checkOrigin(req))return json({error:"Origen no permitido."},403);

  let p:ReturnType<typeof payload>;
  try{
    const row=await req.json() as SourceRow;
    p=payload(row);
  }catch{
    return json({error:"Datos inválidos. Revisá la liquidación o volvé a cargar el Excel."},400);
  }

  let accessToken:string;
  try{
    accessToken=await token();
  }catch(error){
    return json({error:error instanceof Error?error.message:"No se pudo autenticar."},503);
  }

  let status="uncertain";
  let message="Resultado incierto. Verificá en Finnegans antes de volver a cargar esta recepción.";
  try{
    const url="https://api.finneg.com/api/recepcionCompraCDS?ACCESS_TOKEN="+encodeURIComponent(accessToken);
    const response=await fetch(url,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(p),
    });
    const raw=await response.text();
    let body:unknown;
    try{body=JSON.parse(raw);}catch{body=raw;}
    const record=typeof body==="object"&&body!==null?body as Record<string,unknown>:{};
    const businessError=record.error||record.Error||record.errors||record.Errores||record.success===false||record.Success===false;
    const html=typeof body==="string"&&/^\s*</.test(body);
    message=apiResponseMessage(response.status,body,raw);
    status=response.ok&&!businessError&&!html?"sent":"failed";
  }catch(error){
    const detail=error instanceof Error?error.message:String(error);
    message="Error de red al llamar a recepcionCompraCDS: "+(detail||"sin detalle");
  }

  return json({status,message},status==="sent"?200:502);
}
