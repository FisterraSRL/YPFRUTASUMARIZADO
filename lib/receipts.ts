export type SourceRow={
  row:number;
  date:string;
  time:string;
  sourceHash:string;
  card:string;
  plate:string;
  sap:string;
  invoice:string;
  quantity:number;
  price:number;
  net:number;
  product:string;
  businessName?:string;
  branch?:string;
  sucdes?:string;
  empresa?:string;
  sourceRows?:number[];
  period?:string;
  errors:string[];
};

export const round=(n:number,d:number)=>Math.round((n+Number.EPSILON)*10**d)/10**d;

export function identifier(r:SourceRow){
  if(r.sourceRows)return "LIQ_"+(r.period??r.date.slice(0,7)).replace("-","")+"_"+r.sap+"_"+r.sourceHash;
  const time=r.time.replaceAll(":","");
  const liters=String(round(r.quantity,6)).replace(".","-");
  return r.date+"_"+time+"_"+r.card+"_PATENTE"+r.plate+"_LTS"+liters+"_"+r.sourceHash;
}

export function periodLabel(r:SourceRow){
  const [year,month]=(r.period??r.date.slice(0,7)).split("-");
  return month+"/"+year;
}

export function documentDate(r:SourceRow){
  const period=r.period??r.date.slice(0,7);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))return "";
  const [year,month]=period.split("-").map(Number);
  const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  return period+"-"+String(lastDay).padStart(2,"0");
}

export function validate(r:SourceRow){
  const errors:string[]=[];
  if(!r||typeof r!=="object")return ["Fila inválida"];
  if(!Number.isInteger(r.row)||r.row<2)errors.push("Fila inválida");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date)errors.push("Fecha inválida");
  if(r.sourceRows){
    if(!r.sourceRows.length||!r.sourceRows.every(n=>Number.isInteger(n)&&n>=2))errors.push("Filas de origen inválidas");
    if(!r.businessName?.trim())errors.push("Razón social requerida");
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.period??""))errors.push("Período inválido");
    if(r.quantity!==1)errors.push("La cantidad de la liquidación debe ser 1");
    if(!Number.isFinite(r.net)||r.net<=0)errors.push("La sumatoria de U debe ser un número positivo");
    if(r.price!==r.net)errors.push("El precio debe coincidir con la sumatoria de U");
    if(typeof r.sap!=="string"||!r.sap.trim()||r.sap.length>120)errors.push("N° SAP requerido o inválido");
    if(!/^[0-9a-f]{16}$/.test(r.sourceHash))errors.push("Identificación de origen inválida");
    return errors;
  }
  if(!/^\d{2}:\d{2}:\d{2}$/.test(r.time)){
    errors.push("Hora inválida");
  }else{
    const [hour,minute,second]=r.time.split(":").map(Number);
    if(hour>23||minute>59||second>59)errors.push("Hora inválida");
  }
  if(!/^[0-9a-f]{16}$/.test(r.sourceHash))errors.push("Identificación de origen inválida");
  for(const [key,label]of [["card","TARJETA"],["plate","PATENTE"],["sap","N° SAP"],["invoice","NRO.FACTURA"]] as const){
    if(typeof r[key]!=="string"||!r[key].trim()||r[key].length>120)errors.push(label+" requerido o inválido");
  }
  if(!/^\d+$/.test(r.card))errors.push("La tarjeta debe conservarse como texto numérico");
  for(const [key,label]of [["quantity","CANTIDAD LTS"],["price","PU"],["net","NETO FACTURADO"]] as const){
    if(typeof r[key]!=="number"||!Number.isFinite(r[key])||r[key]<=0)errors.push(label+" debe ser un número positivo");
  }
  return errors;
}

export const DEFAULT_EMPRESA="049CDS";
export const validSucdes=(code:unknown):code is string=>typeof code==="string"&&/^[A-Z0-9]{1,20}$/.test(code);

export function payload(r:SourceRow){
  const errors=[...validate(r),...(Array.isArray(r.errors)?r.errors:[])];
  if(!r.sourceRows)errors.push("Se requiere una liquidación agrupada por razón social. Volvé a cargar el Excel.");
  if(!validSucdes(r.sucdes))errors.push("Sucursal (SUCDES) sin seleccionar");
  if(r.empresa!==undefined&&!validSucdes(r.empresa))errors.push("Empresa inválida");
  if(errors.length)throw new Error(errors.join("; "));
  const fecha=documentDate(r);
  return {
    IdentificacionExterna:identifier(r),
    Fecha:fecha,
    FechaBaseVencimiento:fecha,
    Proveedor:r.sap,
    TransaccionTipo:"OPER",
    TransaccionSubtipoCodigo:"YPF-R",
    Workflow:"Fletes",
    Descripcion:"Liquidacion "+r.businessName+" Periodo: "+periodLabel(r),
    NumeroComprobante:r.invoice,
    EmpresaCodigo:r.empresa??DEFAULT_EMPRESA,
    CondicionPagoCodigo:"15",
    Items:[{
      ProductoCodigo:"62",
      CantidadWorkflow:1,
      Precio:round(r.net,6),
      DimensionDistribucion:[["DIMCTC","1160"],["SUCDES",r.sucdes]].map(([dimensionCodigo,codigo])=>({
        dimensionCodigo,
        distribucionCodigo:"",
        tipoCalculo:"2",
        distribucionItems:[{codigo,porcentaje:100,importe:round(r.net,4)}],
      })),
    }],
  };
}
