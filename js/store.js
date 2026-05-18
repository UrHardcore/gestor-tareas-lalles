import { db, auth } from './firebase-config.js';
import {
  collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js';

export const Collections = {
  USERS: 'users',
  TICKETS: 'tickets',
  CUSTOMERS: 'customers',
  COMMENTS: 'comments',
  LOGS: 'logs',
  SETTINGS: 'settings'
};

/* ---------- Users ---------- */
export async function getUser(uid) {
  const snap = await getDoc(doc(db, Collections.USERS, uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getAllUsers() {
  const snap = await getDocs(collection(db, Collections.USERS));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateUser(uid, data) {
  await updateDoc(doc(db, Collections.USERS, uid), { ...data, updatedAt: serverTimestamp() });
}

export async function createUser(uid, data) {
  await setDoc(doc(db, Collections.USERS, uid), {
    ...data,
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp()
  });
}

/* ---------- Tickets ---------- */
let ticketCounter = null;

async function getNextTicketId() {
  const counterRef = doc(db, Collections.SETTINGS, 'ticketCounter');
  const snap = await getDoc(counterRef);
  if (snap.exists()) {
    ticketCounter = (snap.data().current || 0) + 1;
  } else {
    ticketCounter = 1;
  }
  await setDoc(counterRef, { current: ticketCounter });
  return `TK-${String(ticketCounter).padStart(5, '0')}`;
}

export async function createTicket(data) {
  const ticketId = await getNextTicketId();
  const user = auth.currentUser;
  const userData = await getUser(user.uid);

  const ticket = {
    ticketId,
    customer: data.customer || '',
    customerName: data.customerName || '',
    customerNumber: data.customerNumber || '',
    businessName: data.businessName || '',
    address: data.address || '',
    phone: data.phone || '',
    description: data.description || '',
    priority: data.priority || 'medium',
    status: 'pending',
    assignedTo: data.assignedTo || null,
    assignedToName: data.assignedToName || null,
    createdBy: user.uid,
    createdByName: userData?.displayName || user.email,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedAt: null,
    customerId: data.customerId || null
  };

  const ref = await addDoc(collection(db, Collections.TICKETS), ticket);

  await addLog({
    ticketId: ref.id,
    ticketNumber: ticketId,
    action: 'created',
    description: `Ticket ${ticketId} creado`,
    userId: user.uid,
    userName: userData?.displayName || user.email
  });

  return { id: ref.id, ...ticket };
}

export async function updateTicket(id, data, changeDescription) {
  const user = auth.currentUser;
  const userData = await getUser(user.uid);

  await updateDoc(doc(db, Collections.TICKETS, id), {
    ...data,
    updatedAt: serverTimestamp()
  });

  const ticketSnap = await getDoc(doc(db, Collections.TICKETS, id));
  const ticketData = ticketSnap.data();

  if (changeDescription) {
    await addLog({
      ticketId: id,
      ticketNumber: ticketData?.ticketId || '',
      action: 'updated',
      description: changeDescription,
      userId: user.uid,
      userName: userData?.displayName || user.email
    });
  }
}

export async function deleteTicket(id) {
  const user = auth.currentUser;
  const userData = await getUser(user.uid);
  const ticketSnap = await getDoc(doc(db, Collections.TICKETS, id));
  const ticketData = ticketSnap.data();

  await deleteDoc(doc(db, Collections.TICKETS, id));

  await addLog({
    ticketId: id,
    ticketNumber: ticketData?.ticketId || '',
    action: 'deleted',
    description: `Ticket ${ticketData?.ticketId} eliminado`,
    userId: user.uid,
    userName: userData?.displayName || user.email
  });
}

export function subscribeTickets(callback) {
  const q = query(collection(db, Collections.TICKETS), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(tickets);
  });
}

export async function getTicket(id) {
  const snap = await getDoc(doc(db, Collections.TICKETS, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* ---------- Customers ---------- */
export async function importCustomers(customers) {
  const batch = writeBatch(db);
  const results = [];

  for (const c of customers) {
    const ref = doc(collection(db, Collections.CUSTOMERS));
    const customer = {
      name: c.name || c.nombre || c.cliente || '',
      businessName: c.businessName || c.razonSocial || c.razon_social || c['razón social'] || c['Razón Social'] || '',
      customerNumber: c.customerNumber || c.numero || c.número || c.nro || c.id || '',
      address: c.address || c.direccion || c.dirección || c.domicilio || '',
      phone: c.phone || c.telefono || c.teléfono || c.tel || c.celular || '',
      email: c.email || c.correo || c.mail || '',
      notes: c.notes || c.observaciones || c.notas || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    batch.set(ref, customer);
    results.push({ id: ref.id, ...customer });
  }

  await batch.commit();
  return results;
}

export async function getAllCustomers() {
  const snap = await getDocs(query(collection(db, Collections.CUSTOMERS), orderBy('name')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getCustomer(id) {
  const snap = await getDoc(doc(db, Collections.CUSTOMERS, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function searchCustomers(searchTerm) {
  const all = await getAllCustomers();
  const term = searchTerm.toLowerCase();
  return all.filter(c =>
    (c.name || '').toLowerCase().includes(term) ||
    (c.businessName || '').toLowerCase().includes(term) ||
    (c.customerNumber || '').toString().includes(term) ||
    (c.phone || '').includes(term)
  );
}

export async function updateCustomer(id, data) {
  await updateDoc(doc(db, Collections.CUSTOMERS, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteCustomer(id) {
  await deleteDoc(doc(db, Collections.CUSTOMERS, id));
}

/* ---------- Comments ---------- */
export async function addComment(ticketId, text) {
  const user = auth.currentUser;
  const userData = await getUser(user.uid);

  const comment = {
    ticketId,
    text,
    userId: user.uid,
    userName: userData?.displayName || user.email,
    userAlias: userData?.alias || null,
    createdAt: serverTimestamp()
  };

  await addDoc(collection(db, Collections.COMMENTS), comment);

  const ticketSnap = await getDoc(doc(db, Collections.TICKETS, ticketId));
  const ticketData = ticketSnap.data();

  await addLog({
    ticketId,
    ticketNumber: ticketData?.ticketId || '',
    action: 'comment',
    description: `Comentario agregado: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`,
    userId: user.uid,
    userName: userData?.displayName || user.email
  });
}

export function subscribeComments(ticketId, callback) {
  const q = query(
    collection(db, Collections.COMMENTS),
    where('ticketId', '==', ticketId)
  );
  return onSnapshot(q, (snap) => {
    const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    comments.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || 0;
      const tb = b.createdAt?.toMillis?.() || 0;
      return ta - tb;
    });
    callback(comments);
  });
}

/* ---------- Logs / Audit ---------- */
export async function addLog(data) {
  await addDoc(collection(db, Collections.LOGS), {
    ...data,
    createdAt: serverTimestamp()
  });
}

export function subscribeLogs(ticketId, callback) {
  const q = query(
    collection(db, Collections.LOGS),
    where('ticketId', '==', ticketId)
  );
  return onSnapshot(q, (snap) => {
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    logs.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || 0;
      const tb = b.createdAt?.toMillis?.() || 0;
      return tb - ta;
    });
    callback(logs);
  });
}

export async function getAllLogs(limitCount = 100) {
  const q = query(collection(db, Collections.LOGS), orderBy('createdAt', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ---------- Helpers ---------- */
export function formatTimestamp(ts) {
  if (!ts) return '-';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function formatDate(ts) {
  if (!ts) return '-';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatTime(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'Hace un momento';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `Hace ${Math.floor(diff / 86400)}d`;
  return formatDate(ts);
}
