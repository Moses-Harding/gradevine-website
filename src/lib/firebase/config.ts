import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyBdKTMZQbjFw0m19DIjLXhFhA5jgxBM4Pg',
  projectId: 'gradevine-ea94e',
  storageBucket: 'gradevine-ea94e.firebasestorage.app',
  messagingSenderId: '954004669182',
  appId: '1:954004669182:ios:a46d08e7e44953b8d35baf',
  databaseURL: 'https://gradevine-ea94e-default-rtdb.firebaseio.com',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getDatabase(app);
