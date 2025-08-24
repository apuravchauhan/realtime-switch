import * as admin from 'firebase-admin';
import { Account, AccountManager } from '@realtime-switch/core';
import * as crypto from 'crypto';

interface FirestoreAccount {
  email: string;
  key: string;
  createdAt: admin.firestore.Timestamp;
}

interface MagicToken {
  token: string;
  email: string;
  isUsed: boolean;
  expiresAt: admin.firestore.Timestamp;
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

  async getOrCreateAccount(email: string): Promise<Account> {
    try {
      // First, try to find existing account
      const accountQuery = await this.firestore
        .collection('accounts')
        .where('email', '==', email)
        .limit(1)
        .get();

      if (!accountQuery.empty) {
        // Account exists
        const doc = accountQuery.docs[0];
        const data = doc.data() as FirestoreAccount;
        
        return {
          accountId: doc.id,
          email: data.email,
          key: data.key,
          createdAt: data.createdAt.toDate()
        };
      }

      // Account doesn't exist, create new one
      const newAccount: FirestoreAccount = {
        email,
        key: this.generateSecretKey(),
        createdAt: admin.firestore.Timestamp.now()
      };

      // Add to Firestore with auto-generated ID
      const docRef = await this.firestore.collection('accounts').add(newAccount);

      return {
        accountId: docRef.id,
        email: newAccount.email,
        key: newAccount.key,
        createdAt: newAccount.createdAt.toDate()
      };

    } catch (error) {
      throw new Error(`Failed to get or create account: ${error}`);
    }
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

  async saveMagicToken(token: string, email: string): Promise<void> {
    try {
      const magicToken: MagicToken = {
        token,
        email,
        isUsed: false,
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 60 * 1000), // 5 minutes
        createdAt: admin.firestore.Timestamp.now()
      };

      // Use token as document ID to prevent duplicates
      await this.firestore.collection('magic_tokens').doc(token).set(magicToken);

    } catch (error) {
      throw new Error(`Failed to save magic token: ${error}`);
    }
  }

  async markMagicTokenUsed(token: string): Promise<boolean> {
    try {
      const docRef = this.firestore.collection('magic_tokens').doc(token);
      
      // Use transaction to ensure atomicity
      const result = await this.firestore.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        
        if (!doc.exists) {
          return false; // Token doesn't exist
        }

        const data = doc.data() as MagicToken;
        
        // Check if already used
        if (data.isUsed) {
          return false; // Already used
        }

        // Check if expired
        if (data.expiresAt.toMillis() < Date.now()) {
          return false; // Expired
        }

        // Mark as used
        transaction.update(docRef, { isUsed: true });
        return true;
      });

      return result;

    } catch (error) {
      throw new Error(`Failed to mark magic token as used: ${error}`);
    }
  }

  private generateSecretKey(): string {
    return 'rs_live_' + crypto.randomBytes(32).toString('hex');
  }
}