import * as admin from 'firebase-admin';
import { Account, AccountManager } from '@realtime-switch/core';

interface FirestoreAccount {
  email: string;
  key: string;
  createdAt: admin.firestore.Timestamp;
}

export class FirestoreAccountManager implements AccountManager {
  private firestore: admin.firestore.Firestore;

  constructor() {
    // Initialize Firebase Admin if not already initialized
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    }
    this.firestore = admin.firestore();
  }

  async getAccount(accountId: string): Promise<Account | null> {
    try {
      const docRef = this.firestore.collection('accounts').doc(accountId);
      const doc = await docRef.get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data() as FirestoreAccount;
      return {
        accountId: doc.id,
        email: data.email,
        key: data.key,
        createdAt: data.createdAt.toDate()
      };

    } catch (error) {
      throw new Error(`Failed to get account: ${error}`);
    }
  }
}