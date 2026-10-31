// Branches (empresaSucursal) from Finnegans and matching against the Excel "Sucursal" column.
export type Branch={id:number;code:string;name:string;parent:string};

type FinnegansBranch={EmpresaID?:number;codigo?:string;Nombre?:string;nombre?:string;EmpresaPadre?:string;activo?:boolean};

export function parseFinnegansBranches(body:unknown,environment:"PROD"|"DESA"|"TEST"):Branch[]{
  if(environment!=="PROD"){
    const legacy=body as {Empresas?:FinnegansBranch[]};
    return (legacy.Empresas??[])
      .filter(entry=>entry.codigo&&entry.Nombre&&/CDS/i.test(entry.codigo))
      .map(entry=>({id:Number(entry.EmpresaID),code:String(entry.codigo).trim(),name:String(entry.Nombre).trim(),parent:String(entry.EmpresaPadre??"").trim()}))
      .sort((a,b)=>a.name.localeCompare(b.name,"es",{numeric:true}));
  }
  const entries=Array.isArray(body)?body:
    body&&typeof body==="object"&&Array.isArray((body as {Empresas?:unknown}).Empresas)?(body as {Empresas:unknown[]}).Empresas:null;
  if(!entries)throw new Error("Formato de sucursales no reconocido.");
  return entries.filter((entry):entry is FinnegansBranch=>{
    if(!entry||typeof entry!=="object")return false;
    const branch=entry as FinnegansBranch;
    return typeof branch.codigo==="string"&&/CDS/i.test(branch.codigo)
      &&typeof (branch.Nombre??branch.nombre)==="string"&&branch.activo!==false;
  }).map((branch,index)=>({
    id:typeof branch.EmpresaID==="number"&&Number.isFinite(branch.EmpresaID)?branch.EmpresaID:index+1,
    code:branch.codigo!.trim(),
    name:(branch.Nombre??branch.nombre)!.trim(),
    parent:String(branch.EmpresaPadre??"").trim(),
  })).sort((a,b)=>a.name.localeCompare(b.name,"es",{numeric:true}));
}

const ABBREVIATIONS:[RegExp,string][]=[[/\bGRAL\b/g,"GENERAL"],[/\bING\b/g,"INGENIERO"],[/\bPTO\b/g,"PUERTO"],[/\bSTA\b/g,"SANTA"],[/\bSTO\b/g,"SANTO"],[/\bBS AS\b/g,"BUENOS AIRES"]];

export function normalizeBranch(value:string){
  let s=value.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Z0-9]+/g," ").trim();
  for(const [pattern,full]of ABBREVIATIONS)s=s.replace(pattern,full);
  return s;
}

// "14 Neuquén" -> "NEUQUEN"; "02 BS - Bahia Blanca - Beel Sur" -> "BAHIA BLANCA"; "20 Viedma *" -> "VIEDMA"
export function branchCity(name:string){
  return normalizeBranch(name.replace(/^\s*[\d\s]+/,"").replace(/^BS\s*-\s*/i,"").replace(/\s*-\s*Beel Sur\s*$/i,""));
}

const isCds=(b:Branch)=>/CDS$/i.test(b.code);

// Best branch for an Excel value: exact city match first, then a unique partial match. Cruz del Sur (…CDS) wins ties.
export function matchBranch(excel:string,branches:Branch[]):Branch|undefined{
  const target=normalizeBranch(excel);
  if(!target)return undefined;
  const pick=(list:Branch[])=>list.find(isCds)??(list.length===1?list[0]:undefined);
  const exact=branches.filter(b=>branchCity(b.name)===target);
  if(exact.length)return pick(exact);
  const words=(s:string)=>new RegExp("(^| )"+s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"( |$)");
  const partial=branches.filter(b=>{const city=branchCity(b.name);return city.length>3&&(words(target).test(city)||words(city).test(target));});
  const cds=partial.filter(isCds);
  if(cds.length===1)return cds[0];
  return partial.length===1?partial[0]:undefined;
}

export function searchBranches(query:string,branches:Branch[]){
  const q=normalizeBranch(query);
  if(!q)return branches;
  return branches.filter(b=>normalizeBranch(b.name+" "+b.code).includes(q));
}
