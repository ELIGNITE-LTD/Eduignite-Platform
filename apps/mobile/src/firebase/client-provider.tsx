'use client';

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase } from '@/firebase';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

type FirebaseBootstrapState = {
  initError: string | null;
};

const FirebaseBootstrapContext = createContext<FirebaseBootstrapState>({ initError: null });

const getFirebaseInitErrorMessage = (error: unknown) => {
  const rawMessage =
    error instanceof Error ? error.message : 'Unknown Firebase initialization error.';

  if (rawMessage.includes('Need to provide options') || rawMessage.includes('Firebase configuration is incomplete')) {
    return 'Firebase configuration is missing for this deployment. Add the NEXT_PUBLIC_FIREBASE_* variables in Vercel and redeploy the latest commit.';
  }

  return rawMessage;
};

export function useFirebaseBootstrapStatus() {
  return useContext(FirebaseBootstrapContext);
}

export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  const bootstrapState = useMemo(() => {
    try {
      return {
        firebaseServices: initializeFirebase(),
        initError: null,
      };
    } catch (error) {
      console.error('Firebase client initialization failed.', error);
      return {
        firebaseServices: null,
        initError: getFirebaseInitErrorMessage(error),
      };
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  const content = bootstrapState.firebaseServices ? (
    <FirebaseProvider
      firebaseApp={bootstrapState.firebaseServices.firebaseApp}
      auth={bootstrapState.firebaseServices.auth}
      firestore={bootstrapState.firebaseServices.firestore}
    >
      {children}
    </FirebaseProvider>
  ) : (
    <>{children}</>
  );

  return (
    <FirebaseBootstrapContext.Provider value={{ initError: bootstrapState.initError }}>
      {content}
    </FirebaseBootstrapContext.Provider>
  );
}
