import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY as string,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FB_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FB_SENDER_ID as string,
  appId: import.meta.env.VITE_FB_APP_ID as string,
}

/** .env.local 이 채워졌는지 확인 (미설정 시 앱이 안내 화면을 띄움) */
export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

// 설정이 없을 때 getAuth/getFirestore 가 즉시 throw 하지 않도록 준비됐을 때만 초기화한다.
let _app: FirebaseApp | undefined
let _auth: Auth | undefined
let _db: Firestore | undefined
let _storage: FirebaseStorage | undefined
let _provider: GoogleAuthProvider | undefined

if (firebaseReady) {
  _app = initializeApp(firebaseConfig)
  _auth = getAuth(_app)
  _db = getFirestore(_app)
  _storage = getStorage(_app)
  _provider = new GoogleAuthProvider()
  _provider.setCustomParameters({ prompt: 'select_account' })
}

// 아래 값들은 firebaseReady === true 일 때만(AuthProvider 하위에서만) 사용된다.
export const auth = _auth as Auth
export const db = _db as Firestore
export const storage = _storage as FirebaseStorage // 악보 파일(PDF·이미지) 업로드용
export const googleProvider = _provider as GoogleAuthProvider
export const fbApp = _app // FCM(messaging)·functions 초기화용
