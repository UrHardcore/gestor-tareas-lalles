# TicketFlow - Sistema de Gestión de Tickets Técnicos

Sistema profesional de gestión de tickets técnicos, clientes y visitas técnicas. Plataforma web moderna, escalable y responsive, diseñada para uso empresarial real.

## Características Principales

### Autenticación y Roles
- **Login por email/contraseña** con Firebase Authentication
- **Roles diferenciados**: Administrador y Técnico
- **Onboarding de primer inicio**: configuración de nombre visible y alias
- **Persistencia total** de sesión y datos

### Gestión de Tickets
- Creación, edición y eliminación de tickets
- **7 estados**: Pendiente, En Proceso, Asignado, Visitando, Finalizado, Cancelado, Reprogramado
- **3 niveles de prioridad**: Alta, Media, Baja (con indicadores visuales)
- Auto-asignación de tickets por técnicos
- Reasignación de tickets
- ID automático incremental (TK-00001)

### Clientes
- **Importación desde Excel (.xlsx) y CSV**
- Detección inteligente de columnas (nombre, razón social, dirección, teléfono, etc.)
- **Autocompletado** al crear tickets (búsqueda por nombre, número o razón social)
- Modal de información del cliente con ícono `[i]`

### Comentarios en Tiempo Real
- Sistema tipo chat dentro de cada ticket
- Actualización en vivo con Firestore onSnapshot
- Identificación de usuario, fecha y hora

### Historial y Auditoría
- Registro completo de: creación, edición, cambio de estado, asignación, comentarios
- Timeline visual dentro de cada ticket
- Panel de auditoría para administradores

### Tareas Finalizadas
- Sección dedicada con vista de tareas completadas
- Información de quién tomó, finalizó y duración

### Panel de Administración
- Gestión de usuarios (roles, activar/desactivar)
- Importación de bases de datos
- Logs completos de auditoría

### Diseño UI/UX
- **Dark/Light mode** con persistencia
- **Responsive**: PC, tablet, móvil
- Sidebar colapsable + menú hamburguesa en móvil
- Toast notifications
- Skeleton loading
- Animaciones suaves
- Diseño inspirado en Linear, Notion, Jira

## Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript ES Modules
- **Backend**: Firebase (Authentication + Firestore)
- **Importación**: SheetJS (xlsx) vía CDN
- **Fuente**: Inter (Google Fonts)
- **Sin build tools** — funciona directamente en el navegador

## Estructura del Proyecto

```
ticket-manager/
├── index.html              # Página de login
├── app.html                # Aplicación principal (SPA)
├── css/
│   ├── variables.css       # Custom properties, temas (light/dark)
│   ├── base.css            # Reset, tipografía, utilidades, botones, badges
│   ├── layout.css          # Sidebar, header, dashboard, stats
│   ├── components.css      # Modales, toasts, comentarios, timeline
│   ├── login.css           # Estilos del login y onboarding
│   └── responsive.css      # Media queries (tablet + móvil)
├── js/
│   ├── firebase-config.js  # Configuración de Firebase
│   ├── auth.js             # Autenticación y onboarding
│   ├── store.js            # Capa de datos Firestore (CRUD completo)
│   ├── app.js              # Lógica principal, routing, vistas, UI
│   └── utils.js            # Parsers Excel/CSV, toasts, helpers
└── README.md
```

## Estructura de Firestore

```
users/
  {uid}/
    - email, displayName, alias, role, active, createdAt, lastLogin

tickets/
  {docId}/
    - ticketId, customer, customerName, customerNumber, businessName
    - address, phone, description, priority, status
    - assignedTo, assignedToName, createdBy, createdByName
    - createdAt, updatedAt, completedAt, customerId

customers/
  {docId}/
    - name, businessName, customerNumber, address, phone, email, notes
    - createdAt, updatedAt

comments/
  {docId}/
    - ticketId, text, userId, userName, userAlias, createdAt

logs/
  {docId}/
    - ticketId, ticketNumber, action, description, userId, userName, createdAt

settings/
  ticketCounter/
    - current: number
```

## Configuración

### 1. Crear proyecto en Firebase

1. Ir a [Firebase Console](https://console.firebase.google.com/)
2. Crear nuevo proyecto
3. Habilitar **Authentication** → Email/Password
4. Crear **Firestore Database**
5. Copiar la configuración del proyecto

### 2. Configurar credenciales

Editar `js/firebase-config.js` con tus credenciales:

```javascript
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto-id",
  storageBucket: "tu-proyecto.firebasestorage.app",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};
```

### 3. Reglas de Firestore

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 4. Crear primer usuario administrador

1. En Firebase Console → Authentication → Add User
2. Crear usuario con email y contraseña
3. Al iniciar sesión por primera vez, completar el onboarding
4. En Firestore → users → {uid} → cambiar `role` a `"admin"`

### 5. Desplegar

Servir los archivos estáticos con cualquier hosting:
- Firebase Hosting
- Netlify
- Vercel
- Servidor web local

## Flujo de la Aplicación

1. **Login** → Usuario ingresa con email/contraseña
2. **Onboarding** → Si es primer login, configura nombre y alias
3. **Dashboard** → Vista general con estadísticas y actividad reciente
4. **Tickets** → Lista filtrable de tickets con acciones rápidas
5. **Detalle** → Modal con info completa, comentarios y historial
6. **Clientes** → Base de datos de clientes con búsqueda
7. **Admin** → (Solo administradores) Gestión de usuarios, importación, auditoría

## Preparado para Escalar

La arquitectura está diseñada para agregar:
- Notificaciones push (Firebase Cloud Messaging)
- Integración WhatsApp (API)
- Geolocalización de técnicos
- Fotos adjuntas (Firebase Storage)
- Firma digital (Canvas API)
- Dashboard analítico avanzado
- Exportación a PDF
- Métricas y SLA
- Inteligencia Artificial

## Licencia

Proyecto privado - Todos los derechos reservados.
