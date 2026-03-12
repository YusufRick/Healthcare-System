// Firebase Configuration
// TODO: Uncomment and use when ready to integrate Firebase
// Currently using mock auth service for development

/*
import { initializeApp, getApps } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyCzyz3lIJD_49zC_FFeqQHfidNNxf2ej-w",
  authDomain: "healthcare-dispensary-system.firebaseapp.com",
  projectId: "healthcare-dispensary-system",
  storageBucket: "healthcare-dispensary-system.firebasestorage.app",
  messagingSenderId: "943485661935",
  appId: "1:943485661935:web:5d9d6c4aca84e618b4211a",
  measurementId: "G-8J6599Y8JB"
}

// Initialize Firebase only if it hasn't been initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const auth = getAuth(app)
export const db = getFirestore(app)
export default app
*/

// Placeholder exports for when Firebase is not configured
export const auth = null
export const db = null
export default null
