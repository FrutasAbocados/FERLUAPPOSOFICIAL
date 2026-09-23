import test from 'node:test';
import assert from 'node:assert/strict';
import { computa, mensualEquivalente, parseImporte, resumir, type ConGrupo } from '../src/modules/gastos/lib/calc.ts';

const base = { comision: 0, activo: true, fecha_inicio: null, fecha_fin: null, categoria_id: 'c', grupo_resumen: 'otros' as const };
const hoy = '2026-09-23';

test('equivalente mensual por periodicidad', () => {
  assert.equal(mensualEquivalente({ importe: 116, comision: 0, periodicidad: 'trimestral' }), 38.67);
  assert.equal(mensualEquivalente({ importe: 600, comision: 0, periodicidad: 'semestral' }), 100);
  assert.equal(mensualEquivalente({ importe: 1200, comision: 0, periodicidad: 'anual' }), 100);
  assert.equal(mensualEquivalente({ importe: 500, comision: 50, periodicidad: 'mensual' }), 550);
  assert.equal(mensualEquivalente({ importe: null, comision: 0, periodicidad: 'mensual' }), 0);
});

test('solo computan activos y vigentes', () => {
  const g = { ...base, importe: 100, periodicidad: 'mensual' as const };
  assert.equal(computa(g, hoy), true);
  assert.equal(computa({ ...g, activo: false }, hoy), false);
  assert.equal(computa({ ...g, fecha_inicio: '2026-10-01' }, hoy), false);
  assert.equal(computa({ ...g, fecha_fin: '2026-09-22' }, hoy), false);
  assert.equal(computa({ ...g, fecha_fin: hoy }, hoy), true);
});

test('carga inicial suma 19.028,67 €/mes', () => {
  const m = (importe: number | null, grupo: ConGrupo['grupo_resumen'], comision = 0, periodicidad: ConGrupo['periodicidad'] = 'mensual'): ConGrupo =>
    ({ ...base, importe, comision, periodicidad, grupo_resumen: grupo, categoria_id: grupo });
  const gastos = [
    m(1500, 'vehiculos'), m(1300, 'vehiculos'),
    m(250, 'prestamos', 50), m(460, 'prestamos'), m(410, 'prestamos'), m(500, 'prestamos', 50),
    m(500, 'prestamos', 50), m(430, 'prestamos', 90), m(400, 'prestamos'),
    m(400, 'otros'), m(300, 'otros'), m(500, 'otros'), m(null, 'otros'),
    m(300, 'software'),
    m(120, 'seguros'), m(130, 'seguros'), m(116, 'seguros', 0, 'trimestral'),
    m(2500, 'nominas'), m(1600, 'nominas'), m(1500, 'nominas'), m(750, 'nominas'),
    m(2000, 'socios'), m(2000, 'socios'), m(900, 'socios'),
    { ...m(999, 'otros'), activo: false },
  ];
  const r = resumir(gastos, hoy);
  assert.equal(r.total, 19028.67);
  assert.equal(r.porGrupo.prestamos, 3190);
  assert.equal(r.porGrupo.nominas, 6350);
  assert.equal(r.porGrupo.seguros, 288.67);
});

test('parseImporte admite formato español', () => {
  assert.equal(parseImporte('1.500,50'), 1500.5);
  assert.equal(parseImporte('1500.5'), 1500.5);
  assert.equal(parseImporte(''), null);
  assert.ok(Number.isNaN(parseImporte('abc')));
});
