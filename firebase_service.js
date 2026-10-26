// Firebase Service for Mooncat Vault
// Handles Google Sign-In and Cloud Firestore real-time collection sync

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBxLCSW1rGg8E5kWKMkLvnEZoasNxK37Yo",
  authDomain: "mooncat-7cd9d.firebaseapp.com",
  projectId: "mooncat-7cd9d",
  storageBucket: "mooncat-7cd9d.firebasestorage.app",
  messagingSenderId: "666745238922",
  appId: "1:666745238922:web:e34f95468cb9d257764473",
  measurementId: "G-KTYP5N8XEG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let isSyncing = false;
let syncTimeout = null;

// Auth State Listener
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  updateAuthUI(user);

  if (user) {
    console.log("Logged in as:", user.displayName, user.email, user.uid);
    await loadUserDataFromFirestore(user);
  } else {
    console.log("User signed out, running in local mode.");
    if (window.MooncatApp && window.MooncatApp.onCloudSignOut) {
      window.MooncatApp.onCloudSignOut();
    }
  }
});

// Sign in with Google Popup
async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    if (window.MooncatApp && window.MooncatApp.showToast) {
      window.MooncatApp.showToast(`✨ Welcome, ${user.displayName || 'Collector'}!`);
    }
  } catch (error) {
    console.error("Sign-in error:", error);
    if (error.code === 'auth/unauthorized-domain') {
      alert("Notice: This domain is not yet authorized in Firebase Console.\n\nPlease go to Firebase Console > Authentication > Settings > Authorized Domains, and add:\nmrsintegritycode.github.io");
    } else if (error.code !== 'auth/popup-closed-by-user') {
      alert("Sign-in error: " + error.message);
    }
  }
}

// Sign out
async function signOutUser() {
  try {
    await signOut(auth);
    if (window.MooncatApp && window.MooncatApp.showToast) {
      window.MooncatApp.showToast("Signed out. Switched back to local storage.");
    }
  } catch (error) {
    console.error("Sign-out error:", error);
  }
}

// Load User Collection from Firestore
async function loadUserDataFromFirestore(user) {
  try {
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      const emailLower = (user.email || '').toLowerCase();
      const nameLower = (user.displayName || '').toLowerCase();
      const isMelissa = emailLower.includes('melissa') || emailLower.includes('mrsintegritycode') || nameLower.includes('melissa');

      // Ensure verified order shades from seed (such as Jewel Beetle) are merged in if missing
      if (isMelissa && window.MELISSA_VAULT_SEED && window.MELISSA_VAULT_SEED.inventory) {
        const seedInv = window.MELISSA_VAULT_SEED.inventory;
        if (!data.inventory) data.inventory = {};
        let addedCount = 0;
        for (const [id, entry] of Object.entries(seedInv)) {
          if (!data.inventory[id]) {
            data.inventory[id] = entry;
            addedCount++;
          }
        }
        if (addedCount > 0) {
          console.log(`Auto-merged ${addedCount} missing verified order shades into Melissa's Cloud Vault.`);
          await setDoc(userDocRef, { inventory: data.inventory }, { merge: true });
        }
      }

      console.log("Loaded collection from Cloud Firestore:", data);
      if (window.MooncatApp && window.MooncatApp.onCloudDataLoaded) {
        window.MooncatApp.onCloudDataLoaded(data, user);
      }
    } else {
      // New user document in Firestore!
      console.log("Creating new cloud collection document for:", user.displayName, user.email);
      
      const emailLower = (user.email || '').toLowerCase();
      const nameLower = (user.displayName || '').toLowerCase();
      const isMelissa = emailLower.includes('melissa') || emailLower.includes('mrsintegritycode') || nameLower.includes('melissa');

      const initialData = (isMelissa && window.MELISSA_VAULT_SEED)
        ? window.MELISSA_VAULT_SEED
        : { inventory: {}, wishlist: [] };

      // Save initial state to Cloud
      await setDoc(userDocRef, {
        displayName: user.displayName || '',
        email: user.email || '',
        inventory: initialData.inventory || {},
        wishlist: initialData.wishlist || [],
        wishlistRatings: initialData.wishlistRatings || {},
        updatedAt: serverTimestamp()
      });

      if (window.MooncatApp && window.MooncatApp.onCloudDataLoaded) {
        window.MooncatApp.onCloudDataLoaded(initialData, user);
      }

      if (window.MooncatApp && window.MooncatApp.showToast) {
        window.MooncatApp.showToast(isMelissa 
          ? "☁️ Welcome Melissa! Your 28 colors are safely loaded in your private Google Cloud account." 
          : "☁️ Welcome! Your private Google Cloud vault is ready.");
      }
    }
  } catch (err) {
    console.error("Failed to load Firestore data:", err);
    if (err.message && err.message.includes('permission-denied')) {
      console.warn("Firestore permission denied. Ensure Firestore Database is created in test mode in Firebase Console.");
    }
  }
}

// Save User Collection to Firestore (Debounced)
function saveUserDataToFirestore(userData) {
  if (!currentUser) return;

  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      const userDocRef = doc(db, "users", currentUser.uid);
      await setDoc(userDocRef, {
        displayName: currentUser.displayName || '',
        email: currentUser.email || '',
        inventory: userData.inventory || {},
        wishlist: userData.wishlist || [],
        wishlistRatings: userData.wishlistRatings || {},
        updatedAt: serverTimestamp()
      }, { merge: true });

      updateSyncIndicator(true);
    } catch (err) {
      console.error("Error saving to Firestore:", err);
      updateSyncIndicator(false);
    }
  }, 800);
}

// Update Header Auth UI
function updateAuthUI(user) {
  const authContainer = document.getElementById('auth-status-container');
  if (!authContainer) return;

  if (user) {
    authContainer.innerHTML = `
      <div class="user-pill">
        ${user.photoURL ? `<img class="user-avatar" src="${user.photoURL}" alt="avatar">` : '<span class="user-avatar-fallback">👤</span>'}
        <span class="user-name">${user.displayName ? user.displayName.split(' ')[0] : 'Collector'}</span>
        <span class="cloud-indicator" title="Connected to Google Cloud">☁️ 🟢</span>
        <button id="btn-sign-out" class="btn-sign-out" title="Sign out">Sign Out</button>
      </div>
    `;
    const signOutBtn = document.getElementById('btn-sign-out');
    if (signOutBtn) signOutBtn.onclick = signOutUser;
  } else {
    authContainer.innerHTML = `
      <button id="btn-google-sign-in" class="btn-google-login">
        <svg class="google-icon" viewBox="0 0 24 24" width="16" height="16">
          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"/>
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.37 7.34 24 12 24z"/>
          <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.98 0 12c0 2.02.46 3.84 1.26 5.42l4.02-3.15z"/>
          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.25 2.63 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
        </svg>
        Sign in with Google
      </button>
    `;
    const signInBtn = document.getElementById('btn-google-sign-in');
    if (signInBtn) signInBtn.onclick = signInWithGoogle;
  }
}

function updateSyncIndicator(success) {
  const ind = document.querySelector('.cloud-indicator');
  if (ind) {
    ind.textContent = success ? '☁️ 🟢' : '☁️ ⚠️';
  }
}

// Export to window
window.MooncatAuth = {
  signInWithGoogle,
  signOutUser,
  saveUserDataToFirestore,
  getCurrentUser: () => currentUser
};
