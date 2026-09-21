// pdf-lib is already used by the daily margin report. Keep generation in Edge.
// @ts-ignore Deno npm specifier; local PDF QA maps it to the installed package.
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import { type Informe, eur, dia, momento, variacion } from './formato.ts';
export { type Informe, eur, dia, momento, variacion };

const clean = (s: string) => String(s).replace(/[\u2013\u2014\u2212]/g,'-').replace(/[^\x20-\x7e\u00a0-\u00ff\u20ac\u2022]/g,'');

export async function buildPdf(inf: Informe): Promise<Uint8Array> {
  const pdf=await PDFDocument.create();
  pdf.setTitle(`Abocados | Informe de Germán | ${inf.fecha}`);
  pdf.setAuthor('Frutas Abocados');
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const C={ bg:rgb(.055,.085,.072), panel:rgb(.09,.14,.115), line:rgb(.19,.26,.22), ink:rgb(.94,.96,.92), muted:rgb(.62,.71,.64), green:rgb(.57,.87,.60), amber:rgb(.98,.76,.43) };
  const W=595.28,H=841.89,M=32,inner=W-M*2;
  let page: any;
  const rect=(x:number,y:number,w:number,h:number,color=C.panel)=>page.drawRectangle({x,y,width:w,height:h,color});
  const text=(s:string,x:number,y:number,size=10,strong=false,color=C.ink)=>page.drawText(clean(s),{x,y,size,font:strong?bold:regular,color});
  const right=(s:string,x:number,y:number,size=10,strong=false,color=C.ink)=>text(s,x-(strong?bold:regular).widthOfTextAtSize(clean(s),size),y,size,strong,color);
  const fit=(s:string,w:number,size:number)=>{ let t=clean(s); while(regular.widthOfTextAtSize(t,size)>w && t.length>1)t=t.slice(0,-1); return t; };
  function newPage(label:string) {
    page=pdf.addPage([W,H]);rect(0,0,W,H,C.bg);
    text('ABOCADOS',M,H-42,12,true,C.green);right('GERMÁN / COLABORACIONES',W-M,H-42,8,true,C.muted);
    rect(M,H-57,inner,1,C.line);text(label,M,H-89,25,true);
  }
  newPage('Tus clientes. Tu comisión.');
  text(`${dia(inf.inicio)} - ${dia(inf.fecha)} / ${inf.fecha.slice(0,4)}  ·  ${new Date(inf.fecha+'T12:00:00Z').getUTCDay()===0?'Resumen semanal':'Avance de semana'}`,M,H-110,10,false,C.muted);
  const cw=(inner-12)/2;
  function card(x:number,y:number,title:string,value:string,note:string,accent=false) {
    rect(x,y,cw,85);rect(x,y,3,85,accent?C.green:C.line);
    text(title,x+15,y+62,8,true,C.muted);
    text(value,x+15,y+30,25,true,accent?C.green:C.ink);
    text(note,x+15,y+12,8,false,C.muted);
  }
  card(M,618,'FACTURACIÓN DE LA SEMANA',eur(inf.total_semana),'Base sin IVA');
  card(M+cw+12,618,'TU COMISIÓN DE LA SEMANA',eur(inf.comision_semana),'5% de la facturación sin IVA',true);
  card(M,522,'FACTURACIÓN DEL MES',eur(inf.total_mes),`${dia(inf.mes_inicio)} - ${dia(inf.fecha)}`);
  card(M+cw+12,522,'TU COMISIÓN DEL MES',eur(inf.comision_mes),'Acumulado hasta la fecha de corte',true);
  text('CLIENTE A CLIENTE',M,495,10,true);
  const xs=[M+12,M+208,M+293,M+405,W-M-12];
  rect(M,459,inner,23);
  text('Cliente',xs[0],467,8,true,C.muted);right('Semana',xs[1],467,8,true,C.muted);right('Tu 5%',xs[2],467,8,true,C.green);right('Mes',xs[3],467,8,true,C.muted);right('Tu 5% mes',xs[4],467,8,true,C.green);
  inf.clientes.forEach((c,i)=>{
    const y=430-i*34;
    if(i%2===0)rect(M,y-10,inner,33,C.panel);
    text(c.nombre,xs[0],y,10,true);right(eur(c.semana),xs[1],y,10);right(eur(c.comision_semana),xs[2],y,10,true,C.green);
    right(eur(c.mes),xs[3],y,10);right(eur(c.comision_mes),xs[4],y,10,true,C.green);
  });
  rect(M,279,inner,1,C.line);
  text('EVOLUCIÓN Y SEGUIMIENTO',M,257,10,true);
  text(`${variacion(inf.total_semana,inf.total_anterior)} frente a los mismos días de la semana anterior.`,M,237,10,false,C.muted);
  const max=Math.max(1,...inf.clientes.map(c=>Number(c.mes)));
  inf.clientes.forEach((c,i)=>{
    const y=210-i*19;
    text(c.nombre,M,y,8,false,C.muted);rect(M+77,y-1,230,7,C.panel);rect(M+77,y-1,230*Math.max(0,Number(c.mes))/max,7,C.green);
    right(eur(c.mes),M+377,y,8,true);right(`${c.documentos} ${Number(c.documentos)===1?'documento':'documentos'}`,W-M,y,8,false,C.muted);
  });
  text('Barras: facturación acumulada del mes.',M,105,7,false,C.muted);
  const sin=inf.clientes.filter(c=>Number(c.documentos)===0).map(c=>c.nombre);
  text(sin.length?fit(`Sin compras registradas esta semana: ${sin.join(', ')}.`,inner,8):'Los cinco clientes tienen actividad esta semana.',M,86,8,false,sin.length?C.amber:C.green);

  newPage('Detalle de la semana');
  text(`Base de tu comisión del 5% · ${dia(inf.inicio)} - ${dia(inf.fecha)} · importes sin IVA`,M,H-112,10,false,C.muted);
  let y=H-151;
  function header(){ rect(M,y-6,inner,23);text('Cliente / documento',M+10,y+2,8,true,C.muted);right('Fecha',M+335,y+2,8,true,C.muted);right('Sin IVA',M+435,y+2,8,true,C.muted);right('Tu 5%',W-M-10,y+2,8,true,C.green);y-=35; }
  header();
  if(!inf.documentos.length){text('Aún no hay documentos registrados en esta semana.',M,y,11,false,C.muted);y-=35;}
  let last='';
  for(const d of inf.documentos){
    if(y<190&&d.cliente!==last){newPage('Detalle de la semana / continuación');y=H-133;header();last='';}
    else if(y<171){newPage('Detalle de la semana / continuación');y=H-133;header();last='';}
    if(d.cliente!==last){text(d.cliente,M+10,y,11,true,C.green);y-=19;last=d.cliente;}
    const tipo=({invoice:'Factura',salesreceipt:'Ticket',waybill:'Albarán',creditnote:'Abono'} as Record<string,string>)[d.tipo]??d.tipo;
    text(fit(`${tipo} ${d.numero}`,275,9),M+10,y,9);right(dia(d.fecha),M+335,y,9,false,C.muted);right(eur(d.subtotal),M+435,y,9);right(eur(d.comision),W-M-10,y,9,true,C.green);y-=19;
  }
  if(y<160){newPage('Criterio de cálculo');y=H-140;}
  rect(M,y-8,inner,1,C.line);y-=33;
  text('TOTAL SEMANA',M+10,y,10,true);right(eur(inf.total_semana),M+435,y,11,true);right(eur(inf.comision_semana),W-M-10,y,11,true,C.green);
  y-=36;text('CÓMO SE CALCULA',M,y,9,true);y-=17;
  for(const line of [
    'Tu comisión = facturación sin IVA de estos cinco clientes x 5%.',
    'La base usa los documentos de venta efectivos, sin duplicar albaranes y su factura resumen.',
    'Los totales se calculan sobre la base total y se redondean al céntimo.',
    'El redondeo por documento o cliente puede producir diferencias de un céntimo al sumar.',
    'Importes calculados sobre ventas registradas; este informe no acredita el pago de la comisión.',
  ]){text(line,M,y,8,false,C.muted);y-=14;}
  const pages=pdf.getPages();
  pages.forEach((p:any,i:number)=>{page=p;rect(M,52,inner,1,C.line);text(`Generado ${momento(inf.generado_at)} · datos ${momento(inf.ultima_sync)} · Madrid`,M,37,7,false,C.muted);right(`${i+1} / ${pages.length}`,W-M,37,8,false,C.muted);});
  return pdf.save();
}
