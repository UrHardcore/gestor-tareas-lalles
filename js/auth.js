import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js';
import {
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js';

const loader = document.getElementById('loader');
const loginPage = document.getElementById('loginPage');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginErrorText = document.getElementById('loginErrorText');
const loginBtn = document.getElementById('loginBtn');
const loginBtnText = document.getElementById('loginBtnText');
const loginSpinner = document.getElementById('loginSpinner');
const togglePassword = document.getElementById('togglePassword');
const onboardingModal = document.getElementById('onboardingModal');
const onboardingForm = document.getElementById('onboardingForm');

const loginSection = document.getElementById('loginSection');
const registerSection = document.getElementById('registerSection');
const registerForm = document.getElementById('registerForm');
const registerBtn = document.getElementById('registerBtn');
const registerBtnText = document.getElementById('registerBtnText');
const registerSpinner = document.getElementById('registerSpinner');
const showRegisterLink = document.getElementById('showRegister');
const showLoginLink = document.getElementById('showLogin');
const toggleRegPassword = document.getElementById('toggleRegPassword');
const loginTitle = document.querySelector('.login-card h2');
const loginSubtitle = document.querySelector('.login-card .login-subtitle');

const googleProvider = new GoogleAuthProvider();

function showError(msg) {
  loginErrorText.textContent = msg;
  loginError.classList.add('visible');
}
function hideError() {
  loginError.classList.remove('visible');
}
function setLoading(on) {
  loginBtn.disabled = on;
  loginBtnText.style.display = on ? 'none' : '';
  loginSpinner.style.display = on ? 'block' : 'none';
}
function setRegLoading(on) {
  registerBtn.disabled = on;
  registerBtnText.style.display = on ? 'none' : '';
  registerSpinner.style.display = on ? 'block' : 'none';
}

const errorMessages = {
  'auth/user-not-found': 'No se encontró una cuenta con ese email.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/invalid-email': 'El formato del email no es válido.',
  'auth/too-many-requests': 'Demasiados intentos. Intentá más tarde.',
  'auth/invalid-credential': 'Credenciales inválidas. Verificá email y contraseña.',
  'auth/network-request-failed': 'Error de conexión. Verificá tu internet.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/popup-closed-by-user': 'Se cerró la ventana de Google. Intentá de nuevo.',
  'auth/cancelled-popup-request': 'Se canceló el inicio con Google.',
  'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Habilitá popups.'
};

// Toggle password visibility (login)
togglePassword?.addEventListener('click', () => {
  const pwd = document.getElementById('password');
  const isPassword = pwd.type === 'password';
  pwd.type = isPassword ? 'text' : 'password';
  togglePassword.innerHTML = isPassword
    ? '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14.12 14.12A9.01 9.01 0 019 16C4 16 1 9 1 9a16.07 16.07 0 013.88-5.12M6.34 6.34A3 3 0 0012 9m-1.66 2.66A3 3 0 016.34 6.34"/><line x1="1" y1="1" x2="17" y2="17"/></svg>'
    : '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 9s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="9" cy="9" r="3"/></svg>';
});

// Toggle password visibility (register)
toggleRegPassword?.addEventListener('click', () => {
  const pwd = document.getElementById('regPassword');
  const isPassword = pwd.type === 'password';
  pwd.type = isPassword ? 'text' : 'password';
  toggleRegPassword.innerHTML = isPassword
    ? '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14.12 14.12A9.01 9.01 0 019 16C4 16 1 9 1 9a16.07 16.07 0 013.88-5.12M6.34 6.34A3 3 0 0012 9m-1.66 2.66A3 3 0 016.34 6.34"/><line x1="1" y1="1" x2="17" y2="17"/></svg>'
    : '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 9s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="9" cy="9" r="3"/></svg>';
});

// Toggle between login and register views
showRegisterLink?.addEventListener('click', (e) => {
  e.preventDefault();
  hideError();
  loginSection.style.display = 'none';
  registerSection.style.display = 'block';
  loginTitle.textContent = 'Crear cuenta';
  loginSubtitle.textContent = 'Registrate para acceder al sistema';
});

showLoginLink?.addEventListener('click', (e) => {
  e.preventDefault();
  hideError();
  registerSection.style.display = 'none';
  loginSection.style.display = 'block';
  loginTitle.textContent = 'Bienvenido de vuelta';
  loginSubtitle.textContent = 'Ingresá con tu cuenta para continuar';
});

// Email/password login
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();
  setLoading(true);

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    const msg = errorMessages[err.code] || 'Error al iniciar sesión. Intentá de nuevo.';
    showError(msg);
    setLoading(false);
  }
});

// Email/password registration
registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const passwordConfirm = document.getElementById('regPasswordConfirm').value;

  if (password !== passwordConfirm) {
    showError('Las contraseñas no coinciden.');
    return;
  }

  setRegLoading(true);

  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    const msg = errorMessages[err.code] || 'Error al crear la cuenta. Intentá de nuevo.';
    showError(msg);
    setRegLoading(false);
  }
});

// Google sign-in
async function handleGoogleSignIn() {
  hideError();
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      const msg = errorMessages[err.code] || 'Error al iniciar con Google. Intentá de nuevo.';
      showError(msg);
    }
  }
}

document.getElementById('googleBtn')?.addEventListener('click', handleGoogleSignIn);
document.getElementById('googleBtnReg')?.addEventListener('click', handleGoogleSignIn);

// Onboarding form
onboardingForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;

  const displayName = document.getElementById('displayName').value.trim();
  const alias = document.getElementById('aliasName').value.trim();

  if (!displayName) return;

  try {
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      displayName,
      alias: alias || null,
      role: 'technician',
      active: true,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
      firstLogin: true
    });
    window.location.href = 'app.html';
  } catch (err) {
    console.error('Error saving profile:', err);
    showError('Error al guardar el perfil. Intentá de nuevo.');
  }
});

// Auth state observer
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        await setDoc(doc(db, 'users', user.uid), { lastLogin: serverTimestamp() }, { merge: true });
        window.location.href = 'app.html';
      } else {
        loader.classList.add('fade-out');
        setTimeout(() => { loader.style.display = 'none'; }, 300);
        setLoading(false);
        setRegLoading(false);
        loginPage.style.display = 'none';
        onboardingModal.classList.add('active');
      }
    } catch (err) {
      console.error('Error checking user:', err);
      loader.classList.add('fade-out');
      setTimeout(() => { loader.style.display = 'none'; }, 300);
      setLoading(false);
      setRegLoading(false);
      showError('Error de conexión con la base de datos. Verificá tu configuración.');
      loginPage.style.display = 'flex';
    }
  } else {
    loader.classList.add('fade-out');
    setTimeout(() => { loader.style.display = 'none'; }, 300);
    loginPage.style.display = 'flex';
  }
});

window.logout = async () => {
  try { await signOut(auth); window.location.href = 'index.html'; }
  catch (err) { console.error('Logout error:', err); }
};
