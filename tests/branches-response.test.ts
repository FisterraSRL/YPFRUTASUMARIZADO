import assert from "node:assert/strict";
import {parseFinnegansBranches} from "../lib/branches";

const production=parseFinnegansBranches([
  {codigo:"002CDS",nombre:"02 Bahia Blanca",descripcion:"REAL",activo:true},
  {codigo:"001CDS",nombre:"01 Computos",descripcion:"REAL",activo:true},
  {codigo:"003CDS",nombre:"03 Cerrada",activo:false},
  {codigo:"001XXX",nombre:"Otra empresa",activo:true},
],"PROD");
assert.deepEqual(production.map(b=>b.code),["001CDS","002CDS"]);
assert.deepEqual(production.map(b=>b.name),["01 Computos","02 Bahia Blanca"]);
assert.equal(new Set(production.map(b=>b.id)).size,production.length);

const development=parseFinnegansBranches({Empresas:[
  {EmpresaID:42,codigo:"014CDS",Nombre:"14 Neuquén",EmpresaPadre:"CDS"},
]},"DESA");
assert.deepEqual(development,[{id:42,code:"014CDS",name:"14 Neuquén",parent:"CDS"}]);
assert.deepEqual(parseFinnegansBranches({Empresas:[{EmpresaID:42,codigo:"014CDS",Nombre:"14 Neuquén"}]},"TEST").map(b=>b.code),["014CDS"]);
assert.deepEqual(parseFinnegansBranches([{codigo:"001CDS",nombre:"01 Computos"}],"DESA"),[]);
assert.throws(()=>parseFinnegansBranches({unexpected:[]},"PROD"),/Formato de sucursales/);
console.log("PASS: sucursales de Producción y DESA/TEST en sus dos formatos");
