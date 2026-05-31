# QUANTUM — Dashboard de Red de Equipo

> Visualiza puntos, niveles, objetivos y estructura de tu red en tiempo real.  
> Tecnología: HTML · CSS · JavaScript · Google Sheets · Apps Script

---

## ¿Qué es Quantum?

**Quantum** es una aplicación web sin backend propio que utiliza **Google Sheets como base de datos** y **Google Apps Script como API REST**. No requiere login, servidores ni frameworks.

Funciones principales:
- 📊 **Dashboard** con puntos grupales, nivel actual y próximos objetivos
- 🌐 **Mapa de red** en vista árbol y constelación
- 🎯 **Objetivos** con múltiples modos (3%–21%, Gana Más, Mini Bronce, Personalizado)
- ⚡ **Simulador** para proyectar puntos hipotéticos sin guardar
- 🧭 **Camino sugerido** ordenado por prioridad de avance
- 👥 **Gestión de equipo** con alta, baja y edición de miembros
- 📋 **Historial** de snapshots del grupo
- 🔄 **Sincronización** automática con Google Sheets + respaldo en LocalStorage

---

## Archivos del proyecto

```
Quantum/
├── index.html              ← Estructura HTML principal
├── style.css               ← Diseño premium oscuro
├── app.js                  ← Lógica JavaScript completa
├── google-apps-script.js   ← Código para pegar en Apps Script
└── README.md               ← Este archivo
```

---

## Configuración paso a paso

### 1. Crear el Google Sheet

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una nueva hoja de cálculo.
2. Asígnale el nombre: `Quantum`

---

### 2. Crear la hoja "Equipo"

1. En la parte inferior, renombra la primera hoja a **`Equipo`**.
2. En la fila 1 escribe estas columnas exactamente así (una por celda, desde A1):

```
ID | Nombre | SponsorID | Puntos | MetaPersonal | Activo | FechaActualizacion
```

3. Agrega los datos iniciales desde la fila 2:

| ID | Nombre | SponsorID | Puntos | MetaPersonal | Activo | FechaActualizacion |
|----|--------|-----------|--------|--------------|--------|-------------------|
| 1  | Joy    |           | 201    | 300          | TRUE   | 2026-05-31        |
| 2  | Jon    | 1         | 85     | 150          | TRUE   | 2026-05-31        |
| 3  | Wall   | 1         | 25     | 150          | TRUE   | 2026-05-31        |
| 4  | Mamá   | 2         | 25     | 150          | TRUE   | 2026-05-31        |

> **Nota:** `SponsorID` vacío = raíz del árbol (Joy). El campo apunta al `ID` del sponsor (upline).

---

### 3. Crear la hoja "Historial"

1. Crea una segunda hoja y renómbrala **`Historial`**.
2. En la fila 1 escribe:

```
Fecha | TotalGrupal | Nivel | Objetivo | Observacion
```

> Puedes dejarla vacía; Quantum irá guardando snapshots automáticamente.

---

### 4. Abrir Apps Script

1. En tu hoja de cálculo, ve al menú: **Extensiones → Apps Script**
2. Se abrirá el editor de código.
3. Borra todo el contenido del archivo `Código.gs`.

---

### 5. Pegar el código de google-apps-script.js

1. Abre el archivo `google-apps-script.js` de este proyecto.
2. Copia **todo** su contenido.
3. Pégalo en el editor de Apps Script (reemplazando el contenido anterior).
4. Guarda con `Ctrl + S`.

> **Opcional:** Para cargar los datos semilla automáticamente, en Apps Script ve a  
> **Ejecutar → Ejecutar función → `seedInitialData`** (solo una vez).

---

### 6. Publicar como Web App

1. En Apps Script, haz clic en **Implementar → Nueva implementación**.
2. Haz clic en el ícono ⚙ y selecciona **Aplicación web**.
3. Configura:
   - **Descripción:** `Quantum API v1`
   - **Ejecutar como:** `Yo (tu cuenta de Google)`
   - **Quién tiene acceso:** `Cualquier usuario`
4. Haz clic en **Implementar**.
5. Autoriza los permisos que solicite Google.
6. **Copia la URL** que aparece (empieza con `https://script.google.com/macros/s/...`).

---

### 7. Pegar la URL en app.js

1. Abre el archivo `app.js`.
2. Busca esta línea cerca del inicio:

```javascript
const GAS_URL = ""; // ← Pegar aquí tu URL de Apps Script
```

3. Pega tu URL entre las comillas:

```javascript
const GAS_URL = "https://script.google.com/macros/s/TU_ID/exec";
```

4. Guarda el archivo.

> **Alternativa sin editar código:** Puedes configurar la URL directamente en la app desde  
> `⚙ Configuración → Conexión Google Sheets → Guardar URL`.  
> La URL se guarda en `localStorage` del navegador.

---

### 8. Probar la conexión

1. Abre `index.html` en tu navegador (o usa un servidor local como Live Server en VS Code).
2. Ve a **Configuración → Probar Conexión**.
3. Si todo está correcto, verás: `✅ Conexión exitosa`.

> ⚠️ **Importante:** Google Apps Script requiere que la hoja esté compartida con tu cuenta.  
> La app leerá y escribirá usando tu identidad de Google.

---

### 9. Compartir la hoja con Joy (y el equipo)

1. En Google Sheets, haz clic en **Compartir** (botón verde arriba a la derecha).
2. Agrega el email de Joy como **Editora**.
3. Ella podrá actualizar puntos directamente en la hoja, y la app los leerá automáticamente.

> 💡 **Tip:** También puedes compartir solo como **Lectora** si no quieres que edite directamente.

---

## Niveles Quantum

| Nivel | Puntos grupales requeridos |
|-------|---------------------------|
| 3%    | 300 puntos                |
| 6%    | 600 puntos                |
| 9%    | 1,200 puntos              |
| 12%   | 2,400 puntos              |
| 15%   | 4,000 puntos              |
| 18%   | 7,000 puntos              |
| 21%   | 10,000 puntos             |

---

## Estructura del equipo (ejemplo inicial)

```
JOY  (201 pts / meta 300)
├── JON  (85 pts / meta 150)
│   └── MAMÁ  (25 pts / meta 150)
└── WALL  (25 pts / meta 150)
```

- Joy es la **raíz** (sin SponsorID)
- Jon y Wall son **frontales directos** de Joy (SponsorID = 1)
- Mamá es **frontal directa** de Jon (SponsorID = 2)

El árbol es completamente dinámico: cualquier persona puede tener múltiples frontales.

---

## Modos de objetivo

| Modo          | Descripción |
|---------------|-------------|
| 3% – 21%      | Alcanzar un total grupal de puntos |
| **Gana Más**  | Cada persona debe tener ≥ 150 pts (configurable) |
| **Mini Bronce** | Líder con ≥ 300 pts + 3 frontales con ≥ 150 pts (configurable) |
| **Personalizado** | Meta de puntos grupales definida por el usuario |

---

## API de Google Apps Script

Los endpoints disponibles son:

### GET
| Parámetro            | Descripción |
|----------------------|-------------|
| `?action=getTeam`    | Devuelve todos los miembros del equipo |
| `?action=getHistory` | Devuelve el historial de snapshots |
| `?action=ping`       | Verifica que la API esté activa |

### POST (body JSON)
| `action`          | Descripción |
|-------------------|-------------|
| `saveMember`      | Crea o actualiza un miembro |
| `deleteMember`    | Elimina un miembro por ID |
| `saveSnapshot`    | Guarda un snapshot en el historial |

---

## Respaldo local (offline)

Quantum guarda automáticamente los datos en `localStorage` del navegador.  
Si no hay conexión a internet:
- La app **carga los últimos datos guardados** localmente
- Los cambios se aplican **localmente primero**, y se sincronizan cuando vuelve la conexión
- El indicador de sincronización muestra el estado en tiempo real

---

## Escalabilidad futura

Este proyecto está diseñado para crecer. Próximas integraciones planificadas:

| Módulo          | Descripción |
|-----------------|-------------|
| 🛍 **Productos** | Catálogo con precios y comisiones |
| 💰 **Ventas**    | Registro de ventas por miembro |
| 📱 **WhatsApp** | Notificaciones automáticas vía WhatsApp Business API |
| 🔄 **n8n**      | Automatizaciones y flujos de trabajo |
| 📊 **CRM**      | Seguimiento de prospectos y clientes |
| 📈 **Reportes** | Exportación PDF/Excel de resultados |
| 🏆 **Rankings** | Tabla de posiciones del equipo |

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| La app no carga datos | Verifica que la URL de Apps Script esté bien configurada |
| Error CORS | Asegúrate de publicar el script como "Cualquier usuario" |
| Datos desactualizados | Usa el botón "Sincronizar Todo" en Configuración |
| La estructura del árbol es incorrecta | Verifica que los `SponsorID` apunten al `ID` correcto |
| No puedo editar la hoja | Asegúrate de que la hoja esté compartida con tu cuenta |

---

## Tecnologías usadas

- **HTML5** — Estructura semántica y accesible
- **CSS3** — Diseño premium oscuro, responsive, animaciones
- **JavaScript (ES2020+)** — Lógica sin frameworks
- **Google Sheets** — Base de datos
- **Google Apps Script** — API REST serverless
- **LocalStorage** — Respaldo offline

---

*Quantum v1.0.0 · Construido con ❤️ para crecer sin límites*
