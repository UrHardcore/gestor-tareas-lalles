/* ---------- Excel / CSV Parser ---------- */

const COLUMN_MAP = {
  'cliente': 'name',
  'nombre': 'name',
  'name': 'name',
  'razon social': 'businessName',
  'razón social': 'businessName',
  'razon_social': 'businessName',
  'business_name': 'businessName',
  'businessname': 'businessName',
  'empresa': 'businessName',
  'numero': 'customerNumber',
  'número': 'customerNumber',
  'nro': 'customerNumber',
  'nro cliente': 'customerNumber',
  'nro_cliente': 'customerNumber',
  'numero cliente': 'customerNumber',
  'número cliente': 'customerNumber',
  'customer_number': 'customerNumber',
  'id': 'customerNumber',
  'cod': 'customerNumber',
  'codigo': 'customerNumber',
  'código': 'customerNumber',
  'direccion': 'address',
  'dirección': 'address',
  'domicilio': 'address',
  'address': 'address',
  'calle': 'address',
  'telefono': 'phone',
  'teléfono': 'phone',
  'tel': 'phone',
  'celular': 'phone',
  'phone': 'phone',
  'movil': 'phone',
  'móvil': 'phone',
  'email': 'email',
  'correo': 'email',
  'mail': 'email',
  'e-mail': 'email',
  'observaciones': 'notes',
  'notas': 'notes',
  'notes': 'notes',
  'comentarios': 'notes',
  'obs': 'notes'
};

function normalizeColumnName(name) {
  return (name || '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s_]/g, '').trim();
}

function mapColumns(headers) {
  const mapping = {};
  headers.forEach((header, index) => {
    const normalized = normalizeColumnName(header);
    for (const [key, value] of Object.entries(COLUMN_MAP)) {
      const normalizedKey = normalizeColumnName(key);
      if (normalized === normalizedKey || normalized.includes(normalizedKey)) {
        mapping[index] = value;
        break;
      }
    }
    if (!mapping[index]) {
      mapping[index] = normalized.replace(/\s+/g, '_') || `column_${index}`;
    }
  });
  return mapping;
}

export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const columnMap = mapColumns(headers);
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    let hasData = false;
    values.forEach((val, idx) => {
      const field = columnMap[idx];
      if (field && val.trim()) {
        row[field] = val.trim();
        hasData = true;
      }
    });
    if (hasData) results.push(row);
  }
  return results;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if ((ch === ',' || ch === ';') && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export async function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        if (rows.length < 2) { resolve([]); return; }

        const headers = rows[0].map(h => (h || '').toString());
        const columnMap = mapColumns(headers);
        const results = [];

        for (let i = 1; i < rows.length; i++) {
          const row = {};
          let hasData = false;
          (rows[i] || []).forEach((val, idx) => {
            const field = columnMap[idx];
            if (field && val != null && val.toString().trim()) {
              row[field] = val.toString().trim();
              hasData = true;
            }
          });
          if (hasData) results.push(row);
        }
        resolve(results);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/* ---------- Toast System ---------- */
let toastContainer = null;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
}

export function showToast(type, title, message = '') {
  ensureToastContainer();

  const icons = {
    success: '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 6L7.5 14.5 4 11"/><circle cx="10" cy="10" r="9"/></svg>',
    error: '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="10" r="9"/><line x1="7" y1="7" x2="13" y2="13"/><line x1="13" y1="7" x2="7" y2="13"/></svg>',
    warning: '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 1.5L1 18h18L10 1.5z"/><line x1="10" y1="7" x2="10" y2="12"/><line x1="10" y1="15" x2="10.01" y2="15"/></svg>',
    info: '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="10" r="9"/><line x1="10" y1="9" x2="10" y2="14"/><line x1="10" y1="6" x2="10.01" y2="6"/></svg>'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
    <button class="toast-dismiss" onclick="this.closest('.toast').remove()">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg>
    </button>
  `;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* ---------- Avatar Color ---------- */
const avatarColors = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b',
  '#22c55e', '#14b8a6', '#3b82f6', '#f97316', '#06b6d4'
];

export function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
}

/* ---------- Status / Priority labels ---------- */
export const STATUS_LABELS = {
  'pending': 'Pendiente',
  'in-progress': 'En Proceso',
  'assigned': 'Asignado',
  'visiting': 'Visitando',
  'completed': 'Finalizado',
  'cancelled': 'Cancelado',
  'rescheduled': 'Reprogramado'
};

export const STATUS_CLASSES = {
  'pending': 'status-pending',
  'in-progress': 'status-in-progress',
  'assigned': 'status-assigned',
  'visiting': 'status-visiting',
  'completed': 'status-completed',
  'cancelled': 'status-cancelled',
  'rescheduled': 'status-rescheduled'
};

export const PRIORITY_LABELS = {
  'high': 'Alta',
  'medium': 'Media',
  'low': 'Baja'
};

export const PRIORITY_CLASSES = {
  'high': 'priority-high',
  'medium': 'priority-medium',
  'low': 'priority-low'
};

/* ---------- Misc ---------- */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
