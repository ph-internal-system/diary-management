import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// users/{email} を参照し、登録状況（role, passwordSet）を取得する。未登録なら null。
export async function fetchUserStatus(email) {
  const snap = await getDoc(doc(db, "users", email));
  if (!snap.exists()) return null;
  return snap.data();
}

// 初回パスワード設定：このタイミングで Authenticationアカウントを新規作成し、
// Firestore側の passwordSet を true に更新する。
export async function completeInitialPasswordSetup(email, password) {
  await createUserWithEmailAndPassword(auth, email, password);
  await updateDoc(doc(db, "users", email), { passwordSet: true });
}

// 通常ログイン（パスワード設定済みユーザー用）
export function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function logout() {
  return signOut(auth);
}

// role に応じた遷移先ファイル名を返す
export function pageForRole(role) {
  return role === "admin" ? "admin.html" : "member.html";
}

// 認証必須ページ（member.html / admin.html）の入口ガード。
// requiredRole を指定すると、role が一致しない場合は正しいページへリダイレクトする。
export function requireAuth(requiredRole) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user || !user.email) {
        location.href = "index.html";
        return;
      }
      const status = await fetchUserStatus(user.email);
      if (!status) {
        location.href = "index.html";
        return;
      }
      if (requiredRole && status.role !== requiredRole) {
        location.href = pageForRole(status.role);
        return;
      }
      resolve({ email: user.email, role: status.role, name: status.name || user.email });
    });
  });
}
