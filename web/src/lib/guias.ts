// "Para qué sirve" y "cómo se usa" de cada sección, en palabras sencillas.
// Se muestra arriba de cada página (se puede cerrar y volver a abrir con "Ayuda").
import type { Rol } from './tipos';

export interface Guia { para: string; pasos: string[] }
type Guias = Record<string, Guia | Partial<Record<Rol | 'todos', Guia>>>;

const G: Guias = {
  '/': {
    lider: { para: 'Tu punto de partida: lo que más vas a usar está aquí a un toque.', pasos: [
      'Registra a tu gente con “Registrar persona” o comparte tu enlace y QR para que se registren solos.',
      'En “Seguimiento” llama o escribe a cada persona y anota si confirma su apoyo.',
      'Mira tu avance frente a tu meta y tu puesto en el ranking de la semana.'] },
    candidato: { para: 'Cómo va tu campaña, en una sola página y en palabras sencillas.', pasos: [
      'Arriba ves cuántos simpatizantes tienes, cuánto crecieron esta semana y cuánto falta para la meta.',
      'Más abajo: cuántos ya confirmaron, si los líderes van al día y dónde eres fuerte o débil.',
      '“Para tener en cuenta” resume lo que tu equipo debe atender. El mapa está en “Mapa y detalle”.'] },
    digitador: { para: 'Desde aquí digitas los resultados de los E14 el día de la elección.', pasos: [
      'Entra a E14 → Digitar.', 'Elige localidad, puesto y mesa, escribe los votos y guarda.', 'Si dos digitaciones no coinciden, el administrador lo revisa.'] },
    todos: { para: 'Una mirada rápida a cómo va la campaña hoy.', pasos: [
      'Las cifras de arriba son lo más importante: registrados, avance de la meta y pendientes.',
      'Toca una cifra para ir al detalle.',
      'Para análisis más profundos ve a Análisis; para el mapa, a Tablero.'] },
  },
  '/tablero': { para: 'El resumen de la campaña en una sola pantalla, con el mapa de dónde están los simpatizantes.', pasos: [
    'Usa los filtros de sexo, edad y localidad para ver un grupo concreto.',
    'En el mapa, los círculos más oscuros son los puestos con más simpatizantes por cada 1.000 votantes.',
    'Abajo están las tablas por localidad y por puesto, si las necesitas.'] },
  '/analisis': { para: 'Entender qué está pasando y decidir qué hacer: dónde hay fuerza, dónde faltan datos y qué líderes necesitan apoyo.', pasos: [
    'Resumen: los hallazgos más importantes en frases cortas.',
    'Territorio: baja de localidad a puesto y a mesa. Potencial: compara con una elección anterior.',
    'Líderes y Calidad: quién rinde y qué datos hay que corregir. Simulación: prueba escenarios.'] },
  '/metas': { para: 'Saber qué líderes van al día con su meta y cuáles necesitan un empujón.', pasos: [
    'Define desde y hasta cuándo se registra: así se calcula cuánto debería llevar cada líder hoy.',
    'Verde va al día, amarillo un poco atrás, rojo muy atrás. La rayita negra marca dónde debería ir.',
    'Toca el lápiz para cambiar una meta. El ranking de la semana se reinicia solo.'] },
  '/registrar': { para: 'Agregar una persona a la base en menos de un minuto.', pasos: [
    'Cédula, nombre, celular, sexo y edad son obligatorios.',
    'Si sabe dónde vota, elige la localidad y busca el puesto; si no aparece, usa “Otro”.',
    'Sin señal también funciona: queda guardado en el celular y se envía solo después.'] },
  '/personas': {
    lider: { para: 'Todas las personas que has registrado.', pasos: [
      'Busca por nombre o cédula.', 'Filtra por estado del lugar de votación para completar los que faltan.', 'Puedes exportar tu lista a Excel.'] },
    todos: { para: 'La base completa de simpatizantes (o la de tus líderes).', pasos: [
      'Busca por nombre o cédula y filtra por estado del lugar de votación.',
      'Exporta a Excel cuando lo necesites: cada exportación queda registrada.',
      'Para corregir puestos en bloque usa “Puestos por revisar”.'] },
  },
  '/mi-enlace': { para: 'Tu enlace y tu QR personales: quien los usa se registra solo y queda contigo.', pasos: [
    'Compártelo por WhatsApp o muéstralo en el celular para que lo escaneen.',
    'Cada persona llena sus datos y acepta el tratamiento de datos.',
    'Si alguien lo comparte donde no debe, genera uno nuevo y el anterior deja de servir.'] },
  '/estadisticas': { para: 'Cómo es tu gente: edades, sexo y dónde votan, y cuánto te falta para tu meta.', pasos: [
    'Revisa tu avance frente a la meta.', 'Mira en qué puestos tienes más personas.', 'Completa el lugar de votación de quienes no lo tienen.'] },
  '/importar': { para: 'Subir muchas personas de una vez desde un Excel.', pasos: [
    'Descarga la plantilla y llénala (o usa tu propio Excel con títulos parecidos).',
    'Súbelo: la plataforma revisa cada fila y te dice cuáles tienen problemas antes de guardar.',
    'Confirma y solo se guardan las filas correctas.'] },
  '/revision': { para: 'Corregir el lugar de votación de las personas que escribieron un puesto que no está en la lista oficial.', pasos: [
    'La plataforma agrupa a quienes escribieron lo mismo.',
    'Elige el puesto oficial correcto y se corrige para todo el grupo de una vez.',
    'Lo que confirmes se aprende: la próxima vez se reconoce solo.'] },
  '/seguimiento': { para: 'Llamar o escribir a cada simpatizante y anotar qué dijo, para saber con quién se cuenta de verdad.', pasos: [
    'Empieza por “Por contactar”. Toca Llamar o WhatsApp (el mensaje va escrito).',
    'Después toca “Anotar” y elige: confirmó, dudoso, no apoya, no contestó o número malo.',
    'Marca con el bus a quien necesite transporte el día de la elección.'] },
  '/eventos': { para: 'Registrar quién asiste a reuniones y caravanas, y sumar personas nuevas con un QR.', pasos: [
    'Crea el evento y elige con qué líder quedan los nuevos.',
    'Proyecta o imprime el QR en la entrada; cada persona lo escanea y llena sus datos.',
    'Al final cierra el evento para que el QR deje de funcionar.'] },
  '/dia-d': { para: 'El día de la elección: saber quién ya votó y a quién falta recordarle.', pasos: [
    'Marca “Ya votó” a cada persona a medida que te confirme.',
    'A los que faltan, mándales un recordatorio por WhatsApp con su puesto y mesa.',
    'En Transporte está la lista de quienes necesitan que los lleven, por puesto.'] },
  '/testigos': { para: 'Que cada mesa donde hay simpatizantes tenga un testigo que cuide el voto y tome la foto del E14.', pasos: [
    'Mira “Dónde faltan testigos”: primero los puestos con más simpatizantes sin cubrir.',
    'Asigna un testigo (persona ya registrada, con celular) a un puesto y sus mesas.',
    'Sin elegir mesas, el testigo cubre todo el puesto.'] },
  '/e14': { para: 'Los resultados reales de la elección, mesa por mesa, y su comparación con los simpatizantes registrados.', pasos: [
    'Crea la elección y digita los E14 (o súbelos en Excel).',
    'Dos digitaciones de la misma mesa se comparan; las diferencias se revisan.',
    'Resultados muestra cumplimiento por localidad, puesto y líder.'] },
  '/lideres': { para: 'Los líderes de la campaña: su meta, su avance, su enlace de registro y su acceso.', pasos: [
    'Crea un líder con su meta.',
    'Desde aquí le das acceso a la plataforma, ves su enlace y QR o ves la plataforma como él.',
    'Revisa quién va atrasado en Metas.'] },
  '/equipo': { para: 'Quién tiene acceso a la plataforma y con qué rol.', pasos: [
    'Invita a alguien: le llega un correo para crear su contraseña.',
    'Cambia el rol o quita el acceso cuando haga falta; sus registros se conservan.',
    'Revisa que administradores y coordinadores tengan la verificación en dos pasos.'] },
  '/datos-personales': { para: 'Cumplir la ley de protección de datos (Ley 1581): atender a quien pregunta por sus datos y dejar rastro de lo sensible.', pasos: [
    'Completa los datos del responsable: aparecen en la política pública.',
    'Atiende cada solicitud antes de que venza el plazo legal (10 o 15 días hábiles).',
    'En “Registro de acciones” ves quién exportó, quién usó “Ver como” y quién borró datos.'] },
  '/cuenta': { para: 'Tu seguridad y tus preferencias.', pasos: [
    'Activa la verificación en dos pasos: además de la contraseña se pide un código del celular.',
    'Cambia tu contraseña cuando quieras.',
    'Si eres administrador o candidato, decide si recibes el informe semanal por correo.'] },
};

export function guiaDe(ruta: string, rol: Rol): Guia | null {
  const g = G[ruta];
  if (!g) return null;
  if ('para' in g) return g as Guia;
  const porRol = g as Partial<Record<Rol | 'todos', Guia>>;
  return porRol[rol] ?? porRol.todos ?? null;
}
