import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire('/home/claude/gestion-territorial/package.json');
const ExcelJS = require('exceljs');
const mesas = JSON.parse(readFileSync('mesas.json','utf8'))
  .sort((a,b)=>a[2].localeCompare(b[2])||a[3].localeCompare(b[3])||a[4]-b[4]);
// Votos deterministas: cubre 0, menos, igual, más y muchos más
const votosDe = (i,e) => [0, Math.max(e-1,0), e, e+2, e*2+3][i%5];
const sinReportar = new Set([7, 33, 59, 85, 101]); // quedan pendientes
const filas = [];
mesas.forEach((m,i)=>{ if(!sinReportar.has(i)) filas.push({z:m[0],c:m[1],l:m[2],p:m[3],mesa:m[4],esp:m[5],votos:votosDe(i,m[5]),i}); });
const libro = new ExcelJS.Workbook(); const h = libro.addWorksheet('E14');
h.addRow(['Localidad','Zona','Código puesto','Puesto','Mesa','Votos E14','Observación']);
for (const f of filas) h.addRow([f.l,f.z,f.c,f.p,f.mesa,f.votos,'']);
// Casos de error a propósito
h.addRow(['Chapinero','02','21','U. SANTO TOMAS CLAUSTRO',999,4,'mesa inexistente']);
h.addRow(['Bosa','07','14','ISLANDIA',2,-3,'votos negativos']);
h.addRow(['Kennedy','08','B4','COLEGIO EL FERROL LA PAZ IED',4,'',"sin votos (vacía)"]);
await libro.xlsx.writeFile('e14_verificacion1.xlsx');
// Segunda verificación: 10 mesas con diferencia; todo lo demás coincide; también reporta 2 de las pendientes
const difIdx = filas.filter((_,k)=>k%10===4).map(f=>f.i);
const v2 = filas.map(f=>({...f, votos: difIdx.includes(f.i) ? f.votos+1 : f.votos}));
for (const i of [7,33]) { const m=mesas[i]; v2.push({z:m[0],c:m[1],l:m[2],p:m[3],mesa:m[4],esp:m[5],votos:m[5],i}); }
writeFileSync('e14_v1.json', JSON.stringify(filas));
writeFileSync('e14_v2.json', JSON.stringify(v2));
console.log({mesas:mesas.length, v1:filas.length, v2:v2.length, diferencias:difIdx.length,
  sumaV1: filas.reduce((a,f)=>a+f.votos,0), sumaEsperados: mesas.reduce((a,m)=>a+m[5],0)});
