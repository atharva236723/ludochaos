/* =====================================================================
   FIREBASE CONFIG — filled in from Firebase console (ludo-chaos project).

   Recommended Realtime Database rules (Rules tab):
   {
     "rules": {
       "rooms": {
         "$roomId": {
           ".read": true,
           ".write": true
         }
       }
     }
   }
===================================================================== */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDkDZLINQncTAqgIVE9-ku5DIe_OEtOaXo",
  authDomain:        "ludo-chaos.firebaseapp.com",
  databaseURL:       "https://ludo-chaos-default-rtdb.firebaseio.com",
  projectId:         "ludo-chaos",
  storageBucket:     "ludo-chaos.firebasestorage.app",
  messagingSenderId: "289839697510",
  appId:             "1:289839697510:web:6f1721fc719e9535d3a7a7"
};
