# Sistema de Guías — Cómo funciona

*Documento explicativo para presentación general (audiencia no técnica)*

---

## 1. ¿Qué problema resuelve?

La empresa mueve paquetes entre **Monterrey (MTY)** y **Ciudad de México (CDMX)**.
Antes de este sistema, saber dónde estaba un paquete dependía de llamadas,
mensajes y registros manuales, lo que generaba tres problemas:

1. **Nadie sabía con certeza dónde estaba cada guía** (¿ya salió?, ¿ya llegó?, ¿ya se entregó?).
2. **Los clientes tenían que llamar** para preguntar por su envío, ocupando tiempo del personal.
3. **Los errores de captura** (registrar mal una salida o una llegada) eran difíciles de detectar y corregir.

El sistema resuelve esto con una idea muy simple: **cada vez que un paquete pasa
por las manos de la empresa, se escanea su código de barras con una pistola
lectora**. Con ese solo gesto, el sistema sabe y registra automáticamente qué
pasó con el paquete, y esa información queda disponible al instante para el
personal (en un panel interno) y para los clientes (en una página de rastreo y
por WhatsApp).

---

## 2. La idea central: el "escaneo inteligente"

Lo más valioso del sistema es que **el operador no tiene que decidir nada al
escanear**. No hay que elegir "registrar salida" o "registrar llegada": el
sistema lo deduce solo.

El operador únicamente configura una vez:

- **En qué plaza está** (Monterrey o CDMX).
- **Qué tipo de operación hace** (bodega, entrega a domicilio, o entrega en mostrador).

A partir de ahí, solo escanea. El sistema mira el historial de cada guía y decide qué significa el escaneo:

| Situación del paquete | Qué entiende el sistema al escanearlo |
|---|---|
| Es la primera vez que se escanea | **Salió** de esta plaza rumbo a la otra |
| Venía en camino hacia aquí | **Llegó** a la bodega de esta plaza |
| Ya estaba en esta bodega | **Vuelve a salir** hacia la otra plaza |
| Se escanea dos veces por accidente | No pasa nada: se registra como escaneo repetido |

Además hay dos modos de entrega:

- **Entrega a domicilio**: un escaneo marca el paquete "en ruta de reparto" y un segundo escaneo lo marca "entregado".
- **Ocurre** (el cliente recoge en bodega): un solo escaneo lo marca "entregado".

El sistema también **previene errores**: por ejemplo, las guías que salen de
Monterrey empiezan con "AN" y las de CDMX con "BN"; si alguien intenta registrar
una salida con el prefijo equivocado, el sistema la rechaza. Y no permite
entregar un paquete que todavía no tiene registrada su llegada.

---

## 3. ¿Qué ve cada quién? Los módulos principales

El sistema tiene **cuatro caras**, cada una pensada para un tipo de usuario:

### a) Panel interno (para el personal)

Una página web protegida con usuario y contraseña, que se abre en la
computadora o tablet conectada a la pistola de escaneo. Tiene:

- **Dashboard**: cuántas guías hay en cada estatus y la actividad reciente.
- **Escanear**: la pantalla de trabajo diario; se escanea y el sistema confirma en pantalla qué registró.
- **Guías e historial**: buscador de guías, con filtros por estatus y plaza, y el detalle de cada guía con su línea de tiempo completa.
- **Configuración**: gestión de usuarios y contraseñas (solo administradores).

### b) Página pública de rastreo (para los clientes)

Una página web **sin contraseña** donde el cliente escribe su número de guía y
ve el estatus y el recorrido de su envío, en lenguaje claro ("Tu envío llegó a
bodega CDMX y está listo"). Se puede poner un botón "Rastrea tu envío" en la
página web de la empresa que lleve directo ahí.

### c) WhatsApp (para los clientes)

El cliente le escribe su número de guía al WhatsApp de la empresa y **recibe
respuesta automática** con el estatus de su envío, sin que nadie del personal
tenga que contestar. Funciona conectado a WhatsApp Business oficial (de Meta).

### d) Control de usuarios y seguridad (para la administración)

- Hay dos tipos de usuario: **administrador** (control total) y **operador** (solo escanear y consultar).
- A cada usuario se le puede asignar una plaza: alguien de Monterrey no puede registrar escaneos como si estuviera en CDMX.
- Los administradores pueden **revertir un escaneo equivocado**: la guía regresa a su estatus anterior y la corrección queda documentada en el historial (nada se borra a escondidas).
- Las contraseñas se guardan cifradas y el sistema bloquea temporalmente los intentos repetidos de adivinar una contraseña.

---

## 4. ¿Cómo fluye la información?

El recorrido típico de un paquete, de principio a fin:

```
  BODEGA MTY                                        BODEGA CDMX
 ┌───────────┐                                     ┌───────────┐
 │  Escaneo  │──── "Salió de MTY a CDMX" ────►     │  Escaneo  │
 │  (salida) │        (en tránsito)                │ (llegada) │
 └───────────┘                                     └─────┬─────┘
                                                         │
                                              "Llegó a bodega CDMX"
                                                         │
                                          ┌──────────────┴──────────────┐
                                          │                             │
                                   Escaneo modo                  Escaneo modo
                                   "domicilio"                     "ocurre"
                                          │                             │
                                  "En ruta de reparto"          "Entregado en
                                          │                       mostrador"
                                   Escaneo de entrega
                                          │
                                     "Entregado"
```

Y en paralelo, **cada escaneo actualiza al instante** lo que ven todos:

```
   Pistola de escaneo ──► Servidor central ──► Base de datos
                               │                (guías + historial)
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        Panel interno    Página pública      WhatsApp
        (personal)       de rastreo          (respuesta
                         (clientes)          automática)
```

Puntos clave de este flujo:

- **Un solo registro central**: no hay dos versiones de la verdad. Lo que escanea el operador en Monterrey es lo mismo que ve el cliente en su celular segundos después.
- **Todo queda en el historial**: cada escaneo guarda qué pasó, en qué plaza y a qué hora. Se puede reconstruir la línea de tiempo completa de cualquier envío.
- **El cliente solo ve lo suyo**: la página pública y WhatsApp solo responden a un número de guía exacto; no exponen la lista de envíos ni información interna (los escaneos repetidos y las correcciones internas tampoco se le muestran al cliente).

---

## 5. ¿Qué tecnologías usa?

En términos sencillos, el sistema son tres piezas estándar y probadas:

| Pieza | Qué es | Para qué sirve aquí |
|---|---|---|
| **Node.js + Express** | El "motor" del sistema (el servidor) | Recibe los escaneos, aplica las reglas de negocio y sirve las páginas web |
| **PostgreSQL** | Base de datos | Guarda las guías, el historial de eventos, los usuarios y las sesiones |
| **WhatsApp Business Cloud API (Meta)** | El canal oficial de WhatsApp para empresas | Permite responder automáticamente las consultas de los clientes |

Otros datos relevantes para la operación:

- **La pistola de escaneo no requiere software especial**: funciona como un teclado (escanea el código y "teclea" el número). Cualquier computadora o tablet con navegador sirve.
- **Es una aplicación web**: no hay nada que instalar en las computadoras del personal ni en los celulares de los clientes; todo funciona desde el navegador o desde WhatsApp.
- **Es ligero y de bajo costo**: son pocas dependencias, puede alojarse en servicios en la nube económicos (Railway, Render, un servidor propio) y la base de datos se crea sola al arrancar.
- **La página de rastreo se puede integrar** a la página web de la empresa de tres formas: una liga directa, incrustada dentro del sitio, o conectando el diseño propio del sitio a la consulta pública del sistema.

---

## 6. Resumen en una frase

> **Un escaneo por cada movimiento del paquete alimenta un registro central
> único, que le da al personal control total de la operación Monterrey–CDMX y
> a los clientes la respuesta inmediata de "¿dónde está mi envío?" por web y
> por WhatsApp, sin llamadas ni capturas manuales.**
