import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs,
  query, where, orderBy, limit, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js';
import * as Store from './store.js';
import {
  showToast, getAvatarColor, getInitials, escapeHtml, debounce,
  STATUS_LABELS, STATUS_CLASSES, PRIORITY_LABELS, PRIORITY_CLASSES,
  parseCSV, parseExcel
} from './utils.js';

let currentUser = null;
let currentUserData = null;
let currentView = 'dashboard';
let allTickets = [];
let allCustomers = [];
let allUsers = [];
let ticketUnsubscribe = null;
let commentUnsubscribe = null;
let logUnsubscribe = null;
let importedData = null;
let currentTicketDetail = null;
let activeFilters = { status: 'all', priority: 'all', assignedTo: 'all' };

/* ========== INIT ========== */
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'index.html'; return; }
  currentUser = user;
  try {
    currentUserData = await Store.getUser(user.uid);
    if (!currentUserData) { window.location.href = 'index.html'; return; }
    initApp();
  } catch (err) {
    console.error('Init error:', err);
    window.location.href = 'index.html';
  }
});

async function initApp() {
  initTheme();
  setupUserUI();
  setupSidebar();
  setupSearch();
  setupEventListeners();
  loadUsers();
  subscribeToTickets();
  loadCustomers();

  const loader = document.getElementById('loader');
  loader.classList.add('fade-out');
  setTimeout(() => { loader.style.display = 'none'; }, 300);

  navigate('dashboard');
}

/* ========== THEME ========== */
function initTheme() {
  const saved = localStorage.getItem('ticketflow_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ticketflow_theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('themeIcon');
  if (theme === 'dark') {
    icon.innerHTML = '<path d="M15 3a9 9 0 11-12 12A7 7 0 0015 3z"/>';
  } else {
    icon.innerHTML = '<circle cx="9" cy="9" r="5"/><line x1="9" y1="1" x2="9" y2="3"/><line x1="9" y1="15" x2="9" y2="17"/><line x1="2.34" y1="3.34" x2="3.76" y2="4.76"/><line x1="14.24" y1="13.24" x2="15.66" y2="14.66"/><line x1="1" y1="9" x2="3" y2="9"/><line x1="15" y1="9" x2="17" y2="9"/><line x1="2.34" y1="14.66" x2="3.76" y2="13.24"/><line x1="14.24" y1="4.76" x2="15.66" y2="3.34"/>';
  }
}

/* ========== USER UI ========== */
function setupUserUI() {
  const avatar = document.getElementById('userAvatar');
  const name = document.getElementById('userName');
  const role = document.getElementById('userRole');
  const displayName = currentUserData.displayName || currentUserData.email;
  const color = getAvatarColor(displayName);

  avatar.textContent = getInitials(displayName);
  avatar.style.background = color;
  name.textContent = displayName;
  role.textContent = currentUserData.role === 'admin' ? 'Administrador' : 'Técnico';

  if (currentUserData.role === 'admin') {
    document.getElementById('adminSection').style.display = 'block';
  }
}

/* ========== SIDEBAR ========== */
function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebarToggle');
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const overlay = document.getElementById('mobileOverlay');

  const collapsed = localStorage.getItem('ticketflow_sidebar') === 'collapsed';
  if (collapsed) sidebar.classList.add('collapsed');

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('ticketflow_sidebar',
      sidebar.classList.contains('collapsed') ? 'collapsed' : 'expanded');
  });

  mobileBtn.addEventListener('click', () => {
    sidebar.classList.add('mobile-open');
    overlay.classList.add('active');
  });

  overlay.addEventListener('click', closeMobileSidebar);
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('mobileOverlay').classList.remove('active');
}

/* ========== NAVIGATION ========== */
function navigate(view) {
  currentView = view;
  closeMobileSidebar();
  closeAllModals();

  document.querySelectorAll('.sidebar-link').forEach(l => {
    l.classList.toggle('active', l.dataset.view === view);
  });

  const titles = {
    'dashboard': 'Dashboard',
    'tickets': 'Tickets',
    'customers': 'Clientes',
    'completed': 'Tareas Finalizadas',
    'admin-users': 'Gestión de Usuarios',
    'admin-import': 'Importar Base de Datos',
    'admin-logs': 'Auditoría',
    'settings': 'Configuración'
  };
  document.getElementById('headerTitle').textContent = titles[view] || 'TicketFlow';
  renderView(view);
}

/* ========== VIEWS ========== */
function renderView(view) {
  const container = document.getElementById('pageContent');

  if (commentUnsubscribe) { commentUnsubscribe(); commentUnsubscribe = null; }
  if (logUnsubscribe) { logUnsubscribe(); logUnsubscribe = null; }

  switch (view) {
    case 'dashboard': renderDashboard(container); break;
    case 'tickets': renderTickets(container); break;
    case 'customers': renderCustomers(container); break;
    case 'completed': renderCompleted(container); break;
    case 'admin-users': renderAdminUsers(container); break;
    case 'admin-import': renderAdminImport(container); break;
    case 'admin-logs': renderAdminLogs(container); break;
    case 'settings': renderSettings(container); break;
    default: renderDashboard(container);
  }
}

/* ----- Dashboard ----- */
function renderDashboard(container) {
  const open = allTickets.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const mine = open.filter(t => t.assignedTo === currentUser.uid);
  const completed = allTickets.filter(t => t.status === 'completed');
  const high = open.filter(t => t.priority === 'high');

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--primary-bg);color:var(--primary)">
          <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5v2M15 11v2M15 17v2M5 5h14a2 2 0 012 2v3a2 2 0 000 4v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3a2 2 0 000-4V7a2 2 0 012-2z"/></svg>
        </div>
        <div class="stat-value">${open.length}</div>
        <div class="stat-label">Tickets Abiertos</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--info-bg);color:var(--info)">
          <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h8a4 4 0 014 4v2"/></svg>
        </div>
        <div class="stat-value">${mine.length}</div>
        <div class="stat-label">Mis Tickets</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--success-bg);color:var(--success)">
          <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 6L8.5 14.5 5 11"/><circle cx="11" cy="11" r="9"/></svg>
        </div>
        <div class="stat-value">${completed.length}</div>
        <div class="stat-label">Finalizados</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--danger-bg);color:var(--danger)">
          <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 1.5L1 19h20L11 1.5zM11 7v5M11 15h.01"/></svg>
        </div>
        <div class="stat-value">${high.length}</div>
        <div class="stat-label">Prioridad Alta</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Tickets Recientes</h3>
          <button class="btn btn-sm btn-ghost" onclick="window.app.navigate('tickets')">Ver todos</button>
        </div>
        <div id="recentTickets">
          ${renderTicketList(open.slice(0, 5), true)}
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Actividad Reciente</h3>
        </div>
        <div id="recentActivity">
          <div class="empty-state" style="padding:20px">
            <p>La actividad aparecerá aquí</p>
          </div>
        </div>
      </div>
    </div>
  `;

  loadRecentActivity();
}

async function loadRecentActivity() {
  try {
    const logs = await Store.getAllLogs(10);
    const el = document.getElementById('recentActivity');
    if (!el) return;

    if (logs.length === 0) return;

    el.innerHTML = `<div class="timeline">${logs.map(log => {
      const dotClass = log.action === 'created' ? 'primary' :
        log.action === 'completed' ? 'success' :
        log.action === 'deleted' ? 'danger' : '';
      return `
        <div class="timeline-item">
          <div class="timeline-dot ${dotClass}"></div>
          <div class="timeline-content">
            <strong>${escapeHtml(log.userName || '')}</strong> ${escapeHtml(log.description || '')}
          </div>
          <div class="timeline-time">${Store.timeAgo(log.createdAt)}</div>
        </div>`;
    }).join('')}</div>`;
  } catch (e) { console.error(e); }
}

/* ----- Tickets ----- */
function renderTickets(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Tickets</h2>
        <p class="page-subtitle">Gestión de tickets técnicos</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="window.app.openNewTicket()">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>
          Nuevo Ticket
        </button>
      </div>
    </div>

    <div class="filters-bar">
      <span class="filter-chip ${activeFilters.status === 'all' ? 'active' : ''}" onclick="window.app.filterTickets('status','all')">Todos</span>
      <span class="filter-chip ${activeFilters.status === 'pending' ? 'active' : ''}" onclick="window.app.filterTickets('status','pending')">Pendientes</span>
      <span class="filter-chip ${activeFilters.status === 'in-progress' ? 'active' : ''}" onclick="window.app.filterTickets('status','in-progress')">En Proceso</span>
      <span class="filter-chip ${activeFilters.status === 'assigned' ? 'active' : ''}" onclick="window.app.filterTickets('status','assigned')">Asignados</span>
      <span class="filter-chip ${activeFilters.status === 'visiting' ? 'active' : ''}" onclick="window.app.filterTickets('status','visiting')">Visitando</span>
    </div>

    <div id="ticketListContainer">
      ${renderTicketTable(getFilteredTickets())}
    </div>
  `;
}

function getFilteredTickets() {
  let tickets = allTickets.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  if (activeFilters.status !== 'all') {
    tickets = tickets.filter(t => t.status === activeFilters.status);
  }
  if (activeFilters.priority !== 'all') {
    tickets = tickets.filter(t => t.priority === activeFilters.priority);
  }
  return tickets;
}

function renderTicketTable(tickets) {
  if (tickets.length === 0) {
    return `<div class="empty-state">
      <svg width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M32 8v2M32 54v2M12 32h-2M54 32h2M17.37 17.37l-1.41-1.41M48.04 48.04l-1.41-1.41M17.37 46.63l-1.41 1.41M48.04 15.96l-1.41 1.41"/><circle cx="32" cy="32" r="12"/></svg>
      <h3>No hay tickets</h3>
      <p>Los tickets aparecerán aquí cuando se creen</p>
    </div>`;
  }

  return `<div class="table-container"><table class="table">
    <thead><tr>
      <th>ID</th>
      <th>Cliente</th>
      <th>Descripción</th>
      <th>Prioridad</th>
      <th>Estado</th>
      <th>Asignado</th>
      <th>Fecha</th>
      <th></th>
    </tr></thead>
    <tbody>
      ${tickets.map(t => `
        <tr onclick="window.app.openTicketDetail('${t.id}')">
          <td><span class="font-semibold" style="color:var(--primary)">${escapeHtml(t.ticketId || '')}</span></td>
          <td>
            <div class="flex items-center gap-sm">
              <span class="truncate" style="max-width:140px">${escapeHtml(t.customerName || t.customer || '-')}</span>
              ${t.customerId ? `<button class="customer-info-btn" onclick="event.stopPropagation();window.app.showCustomerInfo('${t.customerId}')" data-tooltip="Info cliente">i</button>` : ''}
            </div>
          </td>
          <td><span class="truncate" style="max-width:200px;display:block">${escapeHtml(t.description || '')}</span></td>
          <td><span class="badge ${PRIORITY_CLASSES[t.priority] || ''}">${PRIORITY_LABELS[t.priority] || t.priority}</span></td>
          <td><span class="badge ${STATUS_CLASSES[t.status] || ''}">${STATUS_LABELS[t.status] || t.status}</span></td>
          <td>${t.assignedToName ? escapeHtml(t.assignedToName) : '<span style="color:var(--text-tertiary)">Sin asignar</span>'}</td>
          <td class="text-sm" style="color:var(--text-tertiary)">${Store.timeAgo(t.createdAt)}</td>
          <td>
            <div class="flex gap-xs">
              ${!t.assignedTo && t.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();window.app.takeTicket('${t.id}')" data-tooltip="Tomar">Tomar</button>` : ''}
            </div>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table></div>`;
}

function renderTicketList(tickets, compact = false) {
  if (tickets.length === 0) {
    return '<div class="empty-state" style="padding:20px"><p>No hay tickets</p></div>';
  }
  return tickets.map(t => `
    <div class="flex items-center gap-md" style="padding:10px 4px;border-bottom:1px solid var(--border-light);cursor:pointer" onclick="window.app.openTicketDetail('${t.id}')">
      <div style="flex:1;min-width:0">
        <div class="flex items-center gap-sm">
          <span class="text-sm font-semibold" style="color:var(--primary)">${escapeHtml(t.ticketId || '')}</span>
          <span class="badge ${PRIORITY_CLASSES[t.priority] || ''}" style="font-size:.6875rem">${PRIORITY_LABELS[t.priority] || ''}</span>
        </div>
        <div class="truncate text-sm" style="margin-top:2px">${escapeHtml(t.customerName || t.description || '')}</div>
      </div>
      <span class="badge ${STATUS_CLASSES[t.status] || ''}">${STATUS_LABELS[t.status] || t.status}</span>
    </div>
  `).join('');
}

/* ----- Ticket Detail ----- */
async function openTicketDetail(id) {
  const ticket = allTickets.find(t => t.id === id) || await Store.getTicket(id);
  if (!ticket) { showToast('error', 'Ticket no encontrado'); return; }
  currentTicketDetail = ticket;

  document.getElementById('detailTicketId').textContent = ticket.ticketId || '';
  const statusBadge = document.getElementById('detailTicketStatus');
  statusBadge.textContent = STATUS_LABELS[ticket.status] || ticket.status;
  statusBadge.className = `badge ${STATUS_CLASSES[ticket.status] || ''}`;

  const isAdmin = currentUserData.role === 'admin';
  const isAssigned = ticket.assignedTo === currentUser.uid;
  const canEdit = isAdmin || isAssigned || !ticket.assignedTo;

  const content = document.getElementById('ticketDetailContent');
  content.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 300px;min-height:400px">
      <div style="padding:20px 24px;border-right:1px solid var(--border);display:flex;flex-direction:column">
        <div style="flex:1">
          <div class="flex items-center gap-sm" style="margin-bottom:12px">
            <h4 style="font-weight:600">Cliente: ${escapeHtml(ticket.customerName || ticket.customer || '-')}</h4>
            ${ticket.customerId ? `<button class="customer-info-btn" onclick="window.app.showCustomerInfo('${ticket.customerId}')">i</button>` : ''}
          </div>

          <div class="ticket-description">${escapeHtml(ticket.description || '')}</div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px">
            <div class="ticket-meta-row">
              <span class="ticket-meta-label">Razón Social</span>
              <span class="ticket-meta-value">${escapeHtml(ticket.businessName || '-')}</span>
            </div>
            <div class="ticket-meta-row">
              <span class="ticket-meta-label">N° Cliente</span>
              <span class="ticket-meta-value">${escapeHtml(ticket.customerNumber || '-')}</span>
            </div>
            <div class="ticket-meta-row">
              <span class="ticket-meta-label">Dirección</span>
              <span class="ticket-meta-value">${escapeHtml(ticket.address || '-')}</span>
            </div>
            <div class="ticket-meta-row">
              <span class="ticket-meta-label">Teléfono</span>
              <span class="ticket-meta-value">${escapeHtml(ticket.phone || '-')}</span>
            </div>
            <div class="ticket-meta-row">
              <span class="ticket-meta-label">Creado por</span>
              <span class="ticket-meta-value">${escapeHtml(ticket.createdByName || '-')}</span>
            </div>
            <div class="ticket-meta-row">
              <span class="ticket-meta-label">Fecha</span>
              <span class="ticket-meta-value">${Store.formatTimestamp(ticket.createdAt)}</span>
            </div>
          </div>

          ${canEdit ? `
          <div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap">
            ${ticket.status === 'pending' && !ticket.assignedTo ? `<button class="btn btn-sm btn-primary" onclick="window.app.takeTicket('${ticket.id}')">Tomar Ticket</button>` : ''}
            ${canEdit ? `<select class="form-select" style="padding:6px 10px;font-size:.8125rem" onchange="window.app.changeTicketStatus('${ticket.id}',this.value)">
              ${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${ticket.status === k ? 'selected' : ''}>${v}</option>`).join('')}
            </select>` : ''}
            ${canEdit ? `<select class="form-select" style="padding:6px 10px;font-size:.8125rem" onchange="window.app.changeTicketPriority('${ticket.id}',this.value)">
              ${Object.entries(PRIORITY_LABELS).map(([k, v]) => `<option value="${k}" ${ticket.priority === k ? 'selected' : ''}>${v}</option>`).join('')}
            </select>` : ''}
            <select class="form-select" style="padding:6px 10px;font-size:.8125rem" onchange="window.app.reassignTicket('${ticket.id}',this.value)">
              <option value="">Sin asignar</option>
              ${allUsers.filter(u => u.active !== false).map(u => `<option value="${u.id}" ${ticket.assignedTo === u.id ? 'selected' : ''}>${escapeHtml(u.displayName || u.email)}</option>`).join('')}
            </select>
            ${isAdmin ? `<button class="btn btn-sm btn-secondary" onclick="window.app.editTicket('${ticket.id}')">Editar</button>` : ''}
            ${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="window.app.confirmDeleteTicket('${ticket.id}')">Eliminar</button>` : ''}
          </div>` : ''}
        </div>

        <!-- Comments -->
        <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px">
          <h4 style="font-weight:600;margin-bottom:12px">Comentarios</h4>
          <div id="commentsList" style="max-height:200px;overflow-y:auto;margin-bottom:12px"></div>
          <div class="comment-input-area">
            <input type="text" id="commentInput" placeholder="Escribí un comentario..." onkeydown="if(event.key==='Enter')window.app.sendComment('${ticket.id}')">
            <button class="btn btn-sm btn-primary" onclick="window.app.sendComment('${ticket.id}')">Enviar</button>
          </div>
        </div>
      </div>

      <!-- Right: History -->
      <div style="padding:20px;overflow-y:auto;max-height:500px">
        <h4 style="font-weight:600;margin-bottom:12px">Historial</h4>
        <div id="ticketHistory"></div>
      </div>
    </div>
  `;

  openModal('ticketDetailModal');

  commentUnsubscribe = Store.subscribeComments(id, (comments) => {
    const list = document.getElementById('commentsList');
    if (!list) return;
    if (comments.length === 0) {
      list.innerHTML = '<p class="text-sm" style="color:var(--text-tertiary)">Sin comentarios aún</p>';
    } else {
      list.innerHTML = comments.map(c => `
        <div class="comment">
          <div class="avatar avatar-sm" style="background:${getAvatarColor(c.userName)}">${getInitials(c.userName)}</div>
          <div class="comment-body">
            <div class="comment-header">
              <span class="comment-author">${escapeHtml(c.userName || '')}</span>
              <span class="comment-time">${Store.timeAgo(c.createdAt)}</span>
            </div>
            <div class="comment-text">${escapeHtml(c.text || '')}</div>
          </div>
        </div>
      `).join('');
      list.scrollTop = list.scrollHeight;
    }
  });

  logUnsubscribe = Store.subscribeLogs(id, (logs) => {
    const el = document.getElementById('ticketHistory');
    if (!el) return;
    if (logs.length === 0) {
      el.innerHTML = '<p class="text-sm" style="color:var(--text-tertiary)">Sin historial</p>';
    } else {
      el.innerHTML = `<div class="timeline">${logs.map(log => {
        const dotClass = log.action === 'created' ? 'primary' :
          log.action === 'completed' ? 'success' :
          log.action === 'status_change' ? 'warning' :
          log.action === 'deleted' ? 'danger' : '';
        return `
          <div class="timeline-item">
            <div class="timeline-dot ${dotClass}"></div>
            <div class="timeline-content">
              <strong>${escapeHtml(log.userName || '')}</strong><br>
              ${escapeHtml(log.description || '')}
            </div>
            <div class="timeline-time">${Store.formatTimestamp(log.createdAt)}</div>
          </div>`;
      }).join('')}</div>`;
    }
  });
}

/* ----- Customers ----- */
function renderCustomers(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Clientes</h2>
        <p class="page-subtitle">${allCustomers.length} clientes en la base de datos</p>
      </div>
      <div class="page-actions">
        ${currentUserData.role === 'admin' ? `<button class="btn btn-primary" onclick="window.app.openModal('importModal')">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Importar
        </button>` : ''}
      </div>
    </div>
    <div style="margin-bottom:16px">
      <input type="text" class="form-input" placeholder="Buscar clientes..." id="customerSearchInput" style="max-width:400px" oninput="window.app.searchCustomerList(this.value)">
    </div>
    <div id="customerListContainer">
      ${renderCustomerTable(allCustomers)}
    </div>
  `;
}

function renderCustomerTable(customers) {
  if (customers.length === 0) {
    return `<div class="empty-state">
      <h3>No hay clientes</h3>
      <p>Importá una base de datos para comenzar</p>
    </div>`;
  }
  return `<div class="table-container"><table class="table">
    <thead><tr>
      <th>N°</th>
      <th>Nombre</th>
      <th>Razón Social</th>
      <th>Dirección</th>
      <th>Teléfono</th>
      <th></th>
    </tr></thead>
    <tbody>
      ${customers.map(c => `
        <tr onclick="window.app.showCustomerInfo('${c.id}')">
          <td class="font-semibold">${escapeHtml(c.customerNumber || '-')}</td>
          <td>${escapeHtml(c.name || '-')}</td>
          <td>${escapeHtml(c.businessName || '-')}</td>
          <td class="truncate" style="max-width:200px">${escapeHtml(c.address || '-')}</td>
          <td>${escapeHtml(c.phone || '-')}</td>
          <td>
            <button class="customer-info-btn" onclick="event.stopPropagation();window.app.showCustomerInfo('${c.id}')">i</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table></div>`;
}

/* ----- Completed ----- */
function renderCompleted(container) {
  const completed = allTickets.filter(t => t.status === 'completed');
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Tareas Finalizadas</h2>
        <p class="page-subtitle">${completed.length} tareas completadas</p>
      </div>
    </div>
    <div id="completedListContainer">
      ${completed.length === 0 ? '<div class="empty-state"><h3>Sin tareas finalizadas</h3><p>Las tareas completadas aparecerán aquí</p></div>' : ''}
      ${completed.map(t => `
        <div class="card" style="margin-bottom:12px;cursor:pointer" onclick="window.app.openTicketDetail('${t.id}')">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-md">
              <div>
                <div class="flex items-center gap-sm">
                  <span class="font-semibold" style="color:var(--primary)">${escapeHtml(t.ticketId || '')}</span>
                  <span class="badge badge-success">Finalizado</span>
                </div>
                <div class="text-sm" style="margin-top:4px;color:var(--text-secondary)">${escapeHtml(t.customerName || t.customer || '')}</div>
                <div class="text-sm truncate" style="margin-top:2px;max-width:400px">${escapeHtml(t.description || '')}</div>
              </div>
            </div>
            <div style="text-align:right">
              <div class="text-sm" style="color:var(--text-tertiary)">Asignado: ${escapeHtml(t.assignedToName || '-')}</div>
              <div class="text-xs" style="color:var(--text-tertiary);margin-top:4px">
                Creado: ${Store.formatTimestamp(t.createdAt)}<br>
                ${t.completedAt ? 'Finalizado: ' + Store.formatTimestamp(t.completedAt) : ''}
              </div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/* ----- Admin Users ----- */
function renderAdminUsers(container) {
  if (currentUserData.role !== 'admin') {
    container.innerHTML = '<div class="empty-state"><h3>Acceso denegado</h3></div>';
    return;
  }
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Gestión de Usuarios</h2>
        <p class="page-subtitle">${allUsers.length} usuarios registrados</p>
      </div>
    </div>
    <div class="table-container">
      <table class="table">
        <thead><tr>
          <th>Usuario</th>
          <th>Email</th>
          <th>Rol</th>
          <th>Estado</th>
          <th>Último acceso</th>
          <th>Acciones</th>
        </tr></thead>
        <tbody>
          ${allUsers.map(u => `
            <tr>
              <td>
                <div class="flex items-center gap-sm">
                  <div class="avatar avatar-sm" style="background:${getAvatarColor(u.displayName)}">${getInitials(u.displayName)}</div>
                  <div>
                    <div class="font-medium">${escapeHtml(u.displayName || '-')}</div>
                    ${u.alias ? `<div class="text-xs" style="color:var(--text-tertiary)">${escapeHtml(u.alias)}</div>` : ''}
                  </div>
                </div>
              </td>
              <td class="text-sm">${escapeHtml(u.email || '')}</td>
              <td>
                <select class="form-select" style="padding:4px 8px;font-size:.8125rem" onchange="window.app.changeUserRole('${u.id}',this.value)" ${u.id === currentUser.uid ? 'disabled' : ''}>
                  <option value="technician" ${u.role === 'technician' ? 'selected' : ''}>Técnico</option>
                  <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option>
                </select>
              </td>
              <td>
                <label class="switch" ${u.id === currentUser.uid ? 'style="opacity:.5;pointer-events:none"' : ''}>
                  <input type="checkbox" ${u.active !== false ? 'checked' : ''} onchange="window.app.toggleUserActive('${u.id}',this.checked)">
                  <span class="switch-slider"></span>
                </label>
              </td>
              <td class="text-sm" style="color:var(--text-tertiary)">${Store.formatTimestamp(u.lastLogin)}</td>
              <td class="text-sm">${u.active !== false ? '<span style="color:var(--success)">Activo</span>' : '<span style="color:var(--danger)">Inactivo</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* ----- Admin Import ----- */
function renderAdminImport(container) {
  if (currentUserData.role !== 'admin') {
    container.innerHTML = '<div class="empty-state"><h3>Acceso denegado</h3></div>';
    return;
  }
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Importar Base de Datos</h2>
        <p class="page-subtitle">Importá clientes desde archivos Excel o CSV</p>
      </div>
    </div>
    <div class="card">
      <div class="import-dropzone" id="pageImportDropzone">
        <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M24 32V16"/><polyline points="16 24 24 16 32 24"/><path d="M40 32v6a4 4 0 01-4 4H12a4 4 0 01-4-4v-6"/></svg>
        <h3>Arrastrá tu archivo aquí</h3>
        <p>o hacé click para seleccionar. Formatos: .xlsx, .csv</p>
        <input type="file" id="pageImportFile" accept=".xlsx,.csv,.xls" style="display:none">
      </div>
      <div id="pageImportPreview" style="display:none">
        <div style="display:flex;align-items:center;justify-content:space-between;margin:16px 0 12px">
          <h4 id="pageImportTitle" style="font-weight:600"></h4>
          <button class="btn btn-sm btn-secondary" onclick="window.app.resetPageImport()">Cambiar archivo</button>
        </div>
        <div class="import-preview">
          <div class="table-container" id="pageImportTable"></div>
        </div>
        <div style="margin-top:16px;text-align:right">
          <button class="btn btn-primary" onclick="window.app.confirmPageImport()">Importar Datos</button>
        </div>
      </div>
    </div>
  `;
  setupPageImport();
}

/* ----- Admin Logs ----- */
async function renderAdminLogs(container) {
  if (currentUserData.role !== 'admin') {
    container.innerHTML = '<div class="empty-state"><h3>Acceso denegado</h3></div>';
    return;
  }
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Auditoría</h2>
        <p class="page-subtitle">Registro completo de actividad del sistema</p>
      </div>
    </div>
    <div class="card" id="logsContainer">
      <div style="text-align:center;padding:20px"><div class="spinner" style="margin:0 auto"></div></div>
    </div>
  `;

  const logs = await Store.getAllLogs(200);
  const el = document.getElementById('logsContainer');
  if (!el) return;

  if (logs.length === 0) {
    el.innerHTML = '<div class="empty-state"><h3>Sin registros</h3></div>';
    return;
  }

  el.innerHTML = `<div class="timeline" style="padding:16px">${logs.map(log => {
    const dotClass = log.action === 'created' ? 'primary' :
      log.action === 'completed' ? 'success' :
      log.action === 'deleted' ? 'danger' :
      log.action === 'status_change' ? 'warning' : '';
    return `
      <div class="timeline-item">
        <div class="timeline-dot ${dotClass}"></div>
        <div class="timeline-content">
          <strong>${escapeHtml(log.userName || '')}</strong>
          ${escapeHtml(log.description || '')}
          ${log.ticketNumber ? `<br><span class="text-xs" style="color:var(--text-tertiary)">Ticket: ${escapeHtml(log.ticketNumber)}</span>` : ''}
        </div>
        <div class="timeline-time">${Store.formatTimestamp(log.createdAt)}</div>
      </div>`;
  }).join('')}</div>`;
}

/* ----- Settings ----- */
function renderSettings(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Configuración</h2>
        <p class="page-subtitle">Ajustes de tu cuenta</p>
      </div>
    </div>
    <div class="card" style="max-width:600px">
      <h3 class="card-title" style="margin-bottom:20px">Perfil</h3>
      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label">Nombre visible</label>
        <input type="text" class="form-input" id="settingsName" value="${escapeHtml(currentUserData.displayName || '')}">
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label">Alias</label>
        <input type="text" class="form-input" id="settingsAlias" value="${escapeHtml(currentUserData.alias || '')}">
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label">Email</label>
        <input type="email" class="form-input" value="${escapeHtml(currentUserData.email || '')}" disabled style="opacity:.6">
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label">Rol</label>
        <input type="text" class="form-input" value="${currentUserData.role === 'admin' ? 'Administrador' : 'Técnico'}" disabled style="opacity:.6">
      </div>
      <button class="btn btn-primary" onclick="window.app.saveSettings()">Guardar Cambios</button>
    </div>

    <div class="card" style="max-width:600px;margin-top:20px">
      <h3 class="card-title" style="margin-bottom:20px">Apariencia</h3>
      <div class="flex items-center justify-between">
        <div>
          <div class="font-medium">Modo oscuro</div>
          <div class="text-sm" style="color:var(--text-tertiary)">Cambiar el tema de la interfaz</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="darkModeSwitch" ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'checked' : ''} onchange="window.app.toggleTheme()">
          <span class="switch-slider"></span>
        </label>
      </div>
    </div>
  `;
}

/* ========== DATA ========== */
function subscribeToTickets() {
  ticketUnsubscribe = Store.subscribeTickets((tickets) => {
    allTickets = tickets;
    const openCount = tickets.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length;
    document.getElementById('ticketCount').textContent = openCount;
    if (currentView === 'tickets') renderView('tickets');
    if (currentView === 'completed') renderView('completed');
    if (currentView === 'dashboard') renderView('dashboard');
  });
}

async function loadCustomers() {
  try { allCustomers = await Store.getAllCustomers(); } catch (e) { console.error(e); }
}

async function loadUsers() {
  try { allUsers = await Store.getAllUsers(); } catch (e) { console.error(e); }
}

/* ========== TICKET ACTIONS ========== */
function openNewTicket() {
  document.getElementById('ticketModalTitle').textContent = 'Nuevo Ticket';
  document.getElementById('ticketFormSubmit').textContent = 'Crear Ticket';
  document.getElementById('ticketForm').reset();
  document.getElementById('tf_ticketId').value = '';
  document.getElementById('tf_customerId').value = '';
  populateAssignSelect();
  openModal('ticketModal');
  setupCustomerAutocomplete();
}

async function editTicket(id) {
  const ticket = allTickets.find(t => t.id === id) || await Store.getTicket(id);
  if (!ticket) return;

  closeModal('ticketDetailModal');
  document.getElementById('ticketModalTitle').textContent = 'Editar Ticket';
  document.getElementById('ticketFormSubmit').textContent = 'Guardar Cambios';
  document.getElementById('tf_ticketId').value = id;
  document.getElementById('tf_customerId').value = ticket.customerId || '';
  document.getElementById('tf_customerSearch').value = ticket.customerName || '';
  document.getElementById('tf_customerName').value = ticket.customerName || '';
  document.getElementById('tf_businessName').value = ticket.businessName || '';
  document.getElementById('tf_customerNumber').value = ticket.customerNumber || '';
  document.getElementById('tf_phone').value = ticket.phone || '';
  document.getElementById('tf_address').value = ticket.address || '';
  document.getElementById('tf_priority').value = ticket.priority || 'medium';
  document.getElementById('tf_description').value = ticket.description || '';

  populateAssignSelect(ticket.assignedTo);
  openModal('ticketModal');
  setupCustomerAutocomplete();
}

async function saveTicket() {
  const id = document.getElementById('tf_ticketId').value;
  const assignedToVal = document.getElementById('tf_assignedTo').value;
  const assignedUser = allUsers.find(u => u.id === assignedToVal);

  const data = {
    customerName: document.getElementById('tf_customerName').value.trim(),
    businessName: document.getElementById('tf_businessName').value.trim(),
    customerNumber: document.getElementById('tf_customerNumber').value.trim(),
    phone: document.getElementById('tf_phone').value.trim(),
    address: document.getElementById('tf_address').value.trim(),
    priority: document.getElementById('tf_priority').value,
    description: document.getElementById('tf_description').value.trim(),
    assignedTo: assignedToVal || null,
    assignedToName: assignedUser ? (assignedUser.displayName || assignedUser.email) : null,
    customerId: document.getElementById('tf_customerId').value || null
  };

  if (!data.description) { showToast('warning', 'La descripción es requerida'); return; }

  if (assignedToVal && !data.assignedTo) {
    data.status = 'pending';
  } else if (assignedToVal) {
    data.status = 'assigned';
  }

  try {
    if (id) {
      await Store.updateTicket(id, data, 'Ticket editado');
      showToast('success', 'Ticket actualizado');
    } else {
      await Store.createTicket(data);
      showToast('success', 'Ticket creado correctamente');
    }
    closeModal('ticketModal');
  } catch (err) {
    console.error(err);
    showToast('error', 'Error al guardar', err.message);
  }
}

async function takeTicket(id) {
  try {
    await Store.updateTicket(id, {
      assignedTo: currentUser.uid,
      assignedToName: currentUserData.displayName || currentUserData.email,
      status: 'assigned'
    }, `Ticket tomado por ${currentUserData.displayName || currentUserData.email}`);
    showToast('success', 'Ticket tomado');
  } catch (err) {
    showToast('error', 'Error', err.message);
  }
}

async function changeTicketStatus(id, newStatus) {
  try {
    const data = { status: newStatus };
    if (newStatus === 'completed') data.completedAt = serverTimestamp();
    await Store.updateTicket(id, data, `Estado cambiado a: ${STATUS_LABELS[newStatus] || newStatus}`);
    showToast('success', `Estado: ${STATUS_LABELS[newStatus]}`);
    if (currentTicketDetail?.id === id) openTicketDetail(id);
  } catch (err) {
    showToast('error', 'Error', err.message);
  }
}

async function changeTicketPriority(id, newPriority) {
  try {
    await Store.updateTicket(id, { priority: newPriority }, `Prioridad cambiada a: ${PRIORITY_LABELS[newPriority]}`);
    showToast('success', `Prioridad: ${PRIORITY_LABELS[newPriority]}`);
  } catch (err) {
    showToast('error', 'Error', err.message);
  }
}

async function reassignTicket(id, userId) {
  try {
    const user = allUsers.find(u => u.id === userId);
    await Store.updateTicket(id, {
      assignedTo: userId || null,
      assignedToName: user ? (user.displayName || user.email) : null,
      status: userId ? 'assigned' : 'pending'
    }, userId ? `Reasignado a ${user?.displayName || user?.email}` : 'Ticket liberado');
    showToast('success', userId ? 'Ticket reasignado' : 'Ticket liberado');
  } catch (err) {
    showToast('error', 'Error', err.message);
  }
}

function confirmDeleteTicket(id) {
  document.getElementById('confirmTitle').textContent = 'Eliminar Ticket';
  document.getElementById('confirmMessage').textContent = '¿Estás seguro de que querés eliminar este ticket? Esta acción no se puede deshacer.';
  const btn = document.getElementById('confirmAction');
  btn.textContent = 'Eliminar';
  btn.onclick = async () => {
    try {
      await Store.deleteTicket(id);
      closeModal('confirmModal');
      closeModal('ticketDetailModal');
      showToast('success', 'Ticket eliminado');
    } catch (err) {
      showToast('error', 'Error', err.message);
    }
  };
  openModal('confirmModal');
}

/* ========== COMMENTS ========== */
async function sendComment(ticketId) {
  const input = document.getElementById('commentInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  try {
    await Store.addComment(ticketId, text);
  } catch (err) {
    showToast('error', 'Error al enviar comentario');
  }
}

/* ========== CUSTOMER ========== */
async function showCustomerInfo(customerId) {
  const customer = allCustomers.find(c => c.id === customerId) || await Store.getCustomer(customerId);
  if (!customer) { showToast('error', 'Cliente no encontrado'); return; }

  document.getElementById('customerInfoContent').innerHTML = `
    <div class="customer-detail-grid">
      <div class="customer-detail-item">
        <span class="customer-detail-label">Nombre</span>
        <span class="customer-detail-value">${escapeHtml(customer.name || '-')}</span>
      </div>
      <div class="customer-detail-item">
        <span class="customer-detail-label">N° Cliente</span>
        <span class="customer-detail-value">${escapeHtml(customer.customerNumber || '-')}</span>
      </div>
      <div class="customer-detail-item full-width">
        <span class="customer-detail-label">Razón Social</span>
        <span class="customer-detail-value">${escapeHtml(customer.businessName || '-')}</span>
      </div>
      <div class="customer-detail-item full-width">
        <span class="customer-detail-label">Dirección</span>
        <span class="customer-detail-value">${escapeHtml(customer.address || '-')}</span>
      </div>
      <div class="customer-detail-item">
        <span class="customer-detail-label">Teléfono</span>
        <span class="customer-detail-value">${escapeHtml(customer.phone || '-')}</span>
      </div>
      <div class="customer-detail-item">
        <span class="customer-detail-label">Email</span>
        <span class="customer-detail-value">${escapeHtml(customer.email || '-')}</span>
      </div>
      <div class="customer-detail-item full-width">
        <span class="customer-detail-label">Observaciones</span>
        <span class="customer-detail-value">${escapeHtml(customer.notes || '-')}</span>
      </div>
    </div>
  `;
  openModal('customerInfoModal');
}

function setupCustomerAutocomplete() {
  const input = document.getElementById('tf_customerSearch');
  const suggestions = document.getElementById('customerSuggestions');
  if (!input || !suggestions) return;

  input.addEventListener('input', debounce(async () => {
    const term = input.value.trim();
    if (term.length < 2) { suggestions.style.display = 'none'; return; }

    const results = allCustomers.filter(c =>
      (c.name || '').toLowerCase().includes(term.toLowerCase()) ||
      (c.businessName || '').toLowerCase().includes(term.toLowerCase()) ||
      (c.customerNumber || '').toString().includes(term)
    ).slice(0, 8);

    if (results.length === 0) { suggestions.style.display = 'none'; return; }

    suggestions.innerHTML = results.map(c => `
      <div style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border-light);transition:background .15s" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''" onclick="window.app.selectCustomer('${c.id}')">
        <div class="font-medium text-sm">${escapeHtml(c.name || '')} ${c.businessName ? '- ' + escapeHtml(c.businessName) : ''}</div>
        <div class="text-xs" style="color:var(--text-tertiary)">${c.customerNumber ? 'N° ' + escapeHtml(c.customerNumber) : ''} ${c.address ? '| ' + escapeHtml(c.address) : ''}</div>
      </div>
    `).join('');
    suggestions.style.display = 'block';
  }, 200));

  document.addEventListener('click', (e) => {
    if (!suggestions.contains(e.target) && e.target !== input) {
      suggestions.style.display = 'none';
    }
  });
}

function selectCustomer(customerId) {
  const customer = allCustomers.find(c => c.id === customerId);
  if (!customer) return;

  document.getElementById('tf_customerSearch').value = customer.name || '';
  document.getElementById('tf_customerName').value = customer.name || '';
  document.getElementById('tf_businessName').value = customer.businessName || '';
  document.getElementById('tf_customerNumber').value = customer.customerNumber || '';
  document.getElementById('tf_phone').value = customer.phone || '';
  document.getElementById('tf_address').value = customer.address || '';
  document.getElementById('tf_customerId').value = customer.id;
  document.getElementById('customerSuggestions').style.display = 'none';
}

/* ========== IMPORT ========== */
function setupImportDropzone() {
  const dropzone = document.getElementById('importDropzone');
  const fileInput = document.getElementById('importFileInput');
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleImportFile(file, 'modal');
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleImportFile(e.target.files[0], 'modal');
  });
}

function setupPageImport() {
  const dropzone = document.getElementById('pageImportDropzone');
  const fileInput = document.getElementById('pageImportFile');
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleImportFile(file, 'page');
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleImportFile(e.target.files[0], 'page');
  });
}

async function handleImportFile(file, target) {
  try {
    let data;
    if (file.name.endsWith('.csv')) {
      const text = await file.text();
      data = parseCSV(text);
    } else {
      data = await parseExcel(file);
    }

    if (data.length === 0) {
      showToast('warning', 'Archivo vacío', 'No se encontraron datos para importar');
      return;
    }

    importedData = data;

    const prefix = target === 'page' ? 'pageImport' : 'import';

    if (target === 'modal') {
      document.getElementById('importDropzone').style.display = 'none';
      document.getElementById('importPreview').style.display = 'block';
      document.getElementById('importPreviewTitle').textContent = `${data.length} registros encontrados - ${file.name}`;
      document.getElementById('importSubmitBtn').style.display = '';
      renderImportPreview(data, 'importTable');
    } else {
      document.getElementById('pageImportDropzone').style.display = 'none';
      document.getElementById('pageImportPreview').style.display = 'block';
      document.getElementById('pageImportTitle').textContent = `${data.length} registros encontrados - ${file.name}`;
      renderImportPreview(data, 'pageImportTable');
    }
  } catch (err) {
    console.error(err);
    showToast('error', 'Error al leer archivo', err.message);
  }
}

function renderImportPreview(data, containerId) {
  const fields = ['customerNumber', 'name', 'businessName', 'address', 'phone', 'email', 'notes'];
  const fieldLabels = { customerNumber: 'N°', name: 'Nombre', businessName: 'Razón Social', address: 'Dirección', phone: 'Teléfono', email: 'Email', notes: 'Notas' };
  const activeFields = fields.filter(f => data.some(d => d[f]));

  const container = document.getElementById(containerId);
  container.innerHTML = `<table class="table">
    <thead><tr>${activeFields.map(f => `<th>${fieldLabels[f] || f}</th>`).join('')}</tr></thead>
    <tbody>${data.slice(0, 20).map(row => `<tr>${activeFields.map(f => `<td class="text-sm">${escapeHtml(row[f] || '-')}</td>`).join('')}</tr>`).join('')}
    ${data.length > 20 ? `<tr><td colspan="${activeFields.length}" class="text-center text-sm" style="color:var(--text-tertiary)">... y ${data.length - 20} registros más</td></tr>` : ''}</tbody>
  </table>`;
}

async function confirmImport() {
  if (!importedData || importedData.length === 0) return;
  try {
    await Store.importCustomers(importedData);
    showToast('success', `${importedData.length} clientes importados`);
    importedData = null;
    closeModal('importModal');
    await loadCustomers();
    if (currentView === 'customers') renderView('customers');
  } catch (err) {
    showToast('error', 'Error al importar', err.message);
  }
}

async function confirmPageImport() {
  if (!importedData || importedData.length === 0) return;
  try {
    await Store.importCustomers(importedData);
    showToast('success', `${importedData.length} clientes importados`);
    importedData = null;
    await loadCustomers();
    renderView('admin-import');
  } catch (err) {
    showToast('error', 'Error al importar', err.message);
  }
}

function resetImport() {
  importedData = null;
  document.getElementById('importDropzone').style.display = '';
  document.getElementById('importPreview').style.display = 'none';
  document.getElementById('importSubmitBtn').style.display = 'none';
  document.getElementById('importFileInput').value = '';
}

function resetPageImport() {
  importedData = null;
  document.getElementById('pageImportDropzone').style.display = '';
  document.getElementById('pageImportPreview').style.display = 'none';
  document.getElementById('pageImportFile').value = '';
}

/* ========== ADMIN ========== */
async function changeUserRole(uid, role) {
  try {
    await Store.updateUser(uid, { role });
    showToast('success', `Rol actualizado a ${role === 'admin' ? 'Administrador' : 'Técnico'}`);
    await loadUsers();
  } catch (err) {
    showToast('error', 'Error', err.message);
  }
}

async function toggleUserActive(uid, active) {
  try {
    await Store.updateUser(uid, { active });
    showToast('success', active ? 'Usuario activado' : 'Usuario desactivado');
    await loadUsers();
  } catch (err) {
    showToast('error', 'Error', err.message);
  }
}

async function saveSettings() {
  const name = document.getElementById('settingsName').value.trim();
  const alias = document.getElementById('settingsAlias').value.trim();
  if (!name) { showToast('warning', 'El nombre es requerido'); return; }
  try {
    await Store.updateUser(currentUser.uid, { displayName: name, alias: alias || null });
    currentUserData.displayName = name;
    currentUserData.alias = alias;
    setupUserUI();
    showToast('success', 'Perfil actualizado');
  } catch (err) {
    showToast('error', 'Error', err.message);
  }
}

/* ========== SEARCH ========== */
function setupSearch() {
  const input = document.getElementById('globalSearch');
  if (!input) return;

  input.addEventListener('input', debounce(() => {
    const term = input.value.trim().toLowerCase();
    if (!term) {
      if (currentView === 'tickets') renderView('tickets');
      return;
    }

    const results = allTickets.filter(t =>
      (t.ticketId || '').toLowerCase().includes(term) ||
      (t.customerName || '').toLowerCase().includes(term) ||
      (t.customer || '').toLowerCase().includes(term) ||
      (t.description || '').toLowerCase().includes(term) ||
      (t.assignedToName || '').toLowerCase().includes(term)
    );

    navigate('tickets');
    const container = document.getElementById('ticketListContainer');
    if (container) container.innerHTML = renderTicketTable(results);
  }, 300));
}

function searchCustomerList(term) {
  if (!term.trim()) {
    const container = document.getElementById('customerListContainer');
    if (container) container.innerHTML = renderCustomerTable(allCustomers);
    return;
  }
  const lower = term.toLowerCase();
  const filtered = allCustomers.filter(c =>
    (c.name || '').toLowerCase().includes(lower) ||
    (c.businessName || '').toLowerCase().includes(lower) ||
    (c.customerNumber || '').toString().includes(lower) ||
    (c.phone || '').includes(lower)
  );
  const container = document.getElementById('customerListContainer');
  if (container) container.innerHTML = renderCustomerTable(filtered);
}

/* ========== MODALS ========== */
function openModal(id) {
  document.getElementById(id)?.classList.add('active');
  if (id === 'importModal') setupImportDropzone();
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
  if (id === 'ticketDetailModal') {
    if (commentUnsubscribe) { commentUnsubscribe(); commentUnsubscribe = null; }
    if (logUnsubscribe) { logUnsubscribe(); logUnsubscribe = null; }
  }
}
function closeAllModals() {
  document.querySelectorAll('.modal-overlay.active').forEach(m => {
    m.classList.remove('active');
  });
  if (commentUnsubscribe) { commentUnsubscribe(); commentUnsubscribe = null; }
  if (logUnsubscribe) { logUnsubscribe(); logUnsubscribe = null; }
}

/* ========== HELPERS ========== */
function populateAssignSelect(selected = '') {
  const sel = document.getElementById('tf_assignedTo');
  sel.innerHTML = '<option value="">Sin asignar</option>' +
    allUsers.filter(u => u.active !== false).map(u =>
      `<option value="${u.id}" ${u.id === selected ? 'selected' : ''}>${escapeHtml(u.displayName || u.email)}</option>`
    ).join('');
}

function filterTickets(type, value) {
  activeFilters[type] = value;
  renderView('tickets');
}

function toggleUserMenu() {
  document.getElementById('userMenu')?.classList.toggle('active');
}

function setupEventListeners() {
  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('userMenu');
    const user = document.getElementById('sidebarUser');
    if (menu?.classList.contains('active') && !menu.contains(e.target) && !user?.contains(e.target)) {
      menu.classList.remove('active');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });
}

/* ========== LOGOUT ========== */
window.logout = async () => {
  try {
    if (ticketUnsubscribe) ticketUnsubscribe();
    await signOut(auth);
    window.location.href = 'index.html';
  } catch (err) {
    console.error('Logout error:', err);
  }
};

/* ========== EXPOSE API ========== */
window.app = {
  navigate,
  openNewTicket,
  editTicket,
  saveTicket,
  takeTicket,
  openTicketDetail,
  changeTicketStatus,
  changeTicketPriority,
  reassignTicket,
  confirmDeleteTicket,
  sendComment,
  showCustomerInfo,
  selectCustomer,
  filterTickets,
  toggleUserMenu,
  openModal,
  closeModal,
  confirmImport,
  confirmPageImport,
  resetImport,
  resetPageImport,
  changeUserRole,
  toggleUserActive,
  saveSettings,
  searchCustomerList,
  toggleTheme
};
