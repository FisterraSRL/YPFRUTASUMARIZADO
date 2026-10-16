import type {CellValue} from "exceljs";
import {round,validate,type SourceRow} from "./receipts";

function val(value:CellValue):unknown{
  if(value&&typeof value==="object"){
    if("formula" in value||"sharedFormula" in value)return "result" in value?value.result:undefined;
    if("richText" in value)return value.richText.map(item=>item.text).join("");
    if("text" in value)return value.text;
    if("error" in value)return undefined;
  }
  return value;
}

const txt=(value:unknown)=>value==null?"":String(value).trim();

function num(value:unknown):number{
  if(typeof value==="number")return value;
  if(typeof value!=="string"||!value.trim())return NaN;
  const source=value.trim();
  if(/^-?\d+(\.\d+)?$/.test(source))return Number(source);
  if(/^-?(\d{1,3}(\.\d{3})*|\d+),\d+$/.test(source))return Number(source.replaceAll(".","").replace(",","."));
  return NaN;
}

function fromIso(iso:string){
  return {date:iso.slice(0,10),time:iso.slice(11,19)};
}

function transactionDate(value:unknown){
  if(value instanceof Date)return fromIso(value.toISOString());
  if(typeof value==="number")return fromIso(new Date(Date.UTC(1899,11,30)+Math.round(value*86400000)).toISOString());
  const source=txt(value);
  const local=source.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(local)return {
    date:local[3]+"-"+local[2]+"-"+local[1],
    time:String(local[4]||"0").padStart(2,"0")+":"+String(local[5]||"0").padStart(2,"0")+":"+String(local[6]||"0").padStart(2,"0"),
  };
  const iso=source.match(/^(\d{4}-\d{2}-\d{2})(?:T|\s)?(\d{2}:\d{2}(?::\d{2})?)?/);
  if(iso)return {date:iso[1],time:(iso[2]||"00:00:00").padEnd(8,":00")};
  return {date:"",time:""};
}

function canonical(value:unknown){
  if(value instanceof Date)return "date:"+value.toISOString();
  if(typeof value==="number")return "number:"+String(value);
  if(typeof value==="boolean")return "boolean:"+String(value);
  if(typeof value==="string")return "string:"+JSON.stringify(value);
  if(value==null)return "empty";
  try{return "other:"+JSON.stringify(value);}catch{return "other:"+String(value);}
}

function hash64(value:string){
  let first=0x811c9dc5;
  let second=0x9e3779b9;
  for(let index=0;index<value.length;index++){
    const code=value.charCodeAt(index);
    first=Math.imul(first^code,0x01000193);
    second=Math.imul(second^(code+index),0x85ebca6b);
    second^=second>>>13;
  }
  return (first>>>0).toString(16).padStart(8,"0")+(second>>>0).toString(16).padStart(8,"0");
}

const norm=(value:string)=>value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9]/g,"");

export async function readExcel(data:ArrayBuffer){
  const ExcelJS=await import("exceljs");
  const workbook=new ExcelJS.default.Workbook();
  await workbook.xlsx.load(data);
  const sheet=workbook.worksheets.find(candidate=>candidate.name.trim().toUpperCase()==="FINAL");
  if(!sheet)throw new Error("El archivo debe contener la hoja FINAL.");
  if(sheet.rowCount>10001)throw new Error("El máximo es de 10.000 filas por archivo.");

  const columns:Record<string,number>={};
  sheet.getRow(1).eachCell((cell,index)=>{columns[norm(cell.text)]=index;});
  const map={
    date:"FECHADETRANSACCION",
    card:"TARJETA",
    plate:"PATENTE",
    sap:"NSAP",
    invoice:"NROFACTURA",
    quantity:"CANTIDADLTS",
    price:"PU",
    net:"NETOFACTURADO",
    product:"PRODUCTO",
    businessName:"RAZONSOCIAL",
    branch:"SUCURSAL",
  };
  for(const [key,heading]of Object.entries(map)){
    if(!columns[heading]&&["date","sap","businessName"].includes(key))throw new Error("Falta la columna "+heading+" en FINAL.");
  }

  if(!sheet.getCell("U1").text.trim())throw new Error("Falta la columna U (A DESCONTAR) en FINAL.");
  const rows:SourceRow[]=[];
  const sourceKeys:string[]=[];
  sheet.eachRow((row,index)=>{
    if(index===1)return;
    const get=(key:keyof typeof map)=>columns[map[key]]?val(row.getCell(columns[map[key]]).value):undefined;
    if(Object.keys(map).every(key=>get(key as keyof typeof map)==null||get(key as keyof typeof map)===""))return;
    const sourceKey=Array.from({length:sheet.columnCount},(_,cellIndex)=>canonical(val(row.getCell(cellIndex+1).value))).join("\u001f");
    const parsedDate=transactionDate(get("date"));
    const receipt:SourceRow={
      row:index,
      date:parsedDate.date,
      time:parsedDate.time,
      sourceHash:hash64(sourceKey),
      card:txt(get("card")),
      plate:txt(get("plate")),
      sap:txt(get("sap")),
      invoice:txt(get("invoice")),
      quantity:1,
      price:num(val(row.getCell(21).value)),
      net:num(val(row.getCell(21).value)),
      product:txt(get("product")),
      businessName:txt(get("businessName")),
      branch:txt(get("branch")),
      errors:[],
    };
    receipt.sourceRows=[index];
    receipt.period=receipt.date.slice(0,7);
    receipt.errors=validate(receipt);
    rows.push(receipt);
    sourceKeys.push(sourceKey);
  });

  const counts=new Map<string,number>();
  sourceKeys.forEach(key=>counts.set(key,(counts.get(key)||0)+1));
  rows.forEach((row,index)=>{
    if((counts.get(sourceKeys[index])||0)>1)row.errors.push("Fila duplicada: todas las columnas del Excel son idénticas.");
  });
  if(!rows.length)throw new Error("La hoja FINAL no contiene consumos.");
  // All documents share the period of the first transaction in the file.
  const period=rows[0].date.slice(0,7);
  const groups=new Map<string,SourceRow[]>();
  for(const row of rows){
    const key=(row.businessName??"").trim().replace(/\s+/g," ").toLocaleUpperCase("es-AR");
    const group=groups.get(key)??[];
    group.push(row);
    groups.set(key,group);
  }
  return [...groups.values()].map(group=>{
    const first=group[0];
    const total=round(group.reduce((sum,row)=>sum+row.net,0),6);
    const branches=[...new Set(group.map(row=>row.branch??""))];
    const result:SourceRow={
      ...first,period,
      date:group.map(row=>row.date).sort().at(-1)??first.date,
      time:"00:00:00",card:"",plate:"",
      invoice:"LIQ-"+period.replace("-","")+"-"+first.sap,
      product:"Liquidación",
      branch:branches.length===1?branches[0]:"Varias sucursales: elegir una",
      quantity:1,price:total,net:total,
      sourceRows:group.map(row=>row.row),
      sourceHash:hash64(group.map(row=>row.sourceHash).sort().join("|")),
      errors:group.flatMap(row=>row.errors.map(error=>"Fila "+row.row+": "+error)),
    };
    if(new Set(group.map(row=>row.sap)).size>1)result.errors.push("La razón social tiene distintos proveedores SAP. Corregí el Excel antes de enviar.");
    result.errors=[...new Set([...result.errors,...validate(result)])];
    return result;
  });
}
