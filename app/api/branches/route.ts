import {config,json,token} from "@/lib/server";
import {parseFinnegansBranches,type Branch} from "@/lib/branches";

// Loaded once per page load by the browser; cached briefly on the server to avoid repeated calls.
let cached:{value:Branch[];expires:number}|undefined;

export async function GET(){
  if(cached&&cached.expires>Date.now())return json({branches:cached.value});
  let accessToken:string;
  try{accessToken=await token();}catch(error){return json({error:error instanceof Error?error.message:"No se pudo autenticar."},503);}
  try{
    const response=await fetch("https://api.finneg.com/api/empresaSucursal/list?ACCESS_TOKEN="+encodeURIComponent(accessToken));
    const raw=await response.text();
    if(!response.ok)return json({error:"Finnegans respondió HTTP "+response.status+" al listar sucursales: "+raw.slice(0,200)},502);
    const branches=parseFinnegansBranches(JSON.parse(raw),config().FINNEGANS_ENV==="PROD"?"PROD":"DESA");
    cached={value:branches,expires:Date.now()+10*60_000};
    return json({branches});
  }catch(error){
    return json({error:"No se pudieron obtener las sucursales de Finnegans: "+(error instanceof Error?error.message:"sin detalle")},502);
  }
}
